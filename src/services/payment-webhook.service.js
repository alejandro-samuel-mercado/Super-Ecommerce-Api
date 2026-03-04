const prisma = require('../config/prisma');
const NotificationService = require('./notification.service');
const InAppNotificationService = require('./in-app-notification.service');

/**
 * PaymentWebhookService
 * Procesa los webhooks de pago de manera idempotente
 * Asegura que las llamadas duplicadas no resulten en doble deducción de stock
 */
class PaymentWebhookService {
  
  /**
   * Procesa el webhook de pago con garantías completas de idempotencia
   * @param {string} paymentId - ID de pago externo de MercadoPago
   * @param {object} webhookData - Payload completo del webhook
   * @returns {Promise<{status: string, saleId: number}>}
   */
  async processPaymentWebhook(paymentId, webhookData) {
    return await prisma.$transaction(async (tx) => {
      let transaction = await tx.paymentTransaction.findUnique({
        where: { paymentId: String(paymentId) },
        include: { sale: { include: { stockReservations: true } } }
      });
      
      if (transaction?.status === 'COMPLETED') {
        return { status: 'DUPLICATE', saleId: transaction.saleId };
      }
      
      const saleId = parseInt(webhookData.external_reference);
      if (!saleId || isNaN(saleId)) {
        throw new Error('Invalid external_reference in webhook data');
      }
      
      // Paso 3: Crear o actualizar registro de transacción
      if (!transaction) {
        transaction = await tx.paymentTransaction.create({
          data: {
            paymentId: String(paymentId),
            saleId: saleId,
            status: 'PROCESSING',
            webhookPayload: webhookData,
            attempts: 1
          },
          include: { sale: { include: { stockReservations: true } } }
        });
      } else {
        // Actualizar conteo de intentos
        transaction = await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { 
            attempts: { increment: 1 },
            webhookPayload: webhookData
          },
          include: { sale: { include: { stockReservations: true } } }
        });
      }
      
      // Paso 4: Verificar existencia de venta
      let sale = transaction.sale;
      if (!sale) {
        sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { stockReservations: true, user: true }
        });
      }
      
      if (!sale) {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' }
        });
        throw new Error(`Sale ${saleId} not found for payment ${paymentId}`);
      }
      
      // Paso 5: Verificar si ya está pagada
      if (sale.paymentStatus === 'PAID') {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: 'COMPLETED', processedAt: new Date() }
        });
        return { status: 'ALREADY_PAID', saleId: sale.id };
      }
      
      // Paso 6: Convertir reservas de stock en deducciones reales
      
      for (const reservation of sale.stockReservations) {
        if (reservation.released) {
          continue;
        }
        
        const updateResult = await tx.$executeRaw`
          UPDATE "SKU" 
          SET 
            stock = stock - ${reservation.quantity},
            "soldQuantity" = "soldQuantity" + ${reservation.quantity},
            "updatedAt" = NOW()
          WHERE id = ${reservation.skuId} 
            AND stock >= ${reservation.quantity}
        `;

        if (updateResult === 1) {
            await tx.$executeRaw`
              UPDATE "BranchInventory"
              SET 
                stock = stock - ${reservation.quantity},
                "soldQuantity" = "soldQuantity" + ${reservation.quantity},
                "updatedAt" = NOW()
              WHERE id = ${reservation.branchInventoryId}
            `;

            const inv = await tx.branchInventory.findUnique({ where: { id: reservation.branchInventoryId } });
            await tx.stockMovement.create({
                data: {
                    skuId: reservation.skuId,
                    branchId: sale.branchId,
                    type: 'SALE',
                    quantity: -Number(reservation.quantity),
                    resultingStock: inv ? Number(inv.stock) : 0,
                    referenceId: `SALE-${sale.id}`,
                    userId: sale.userId,
                    notes: `Pago online confirmado - Venta #${sale.id}`
                }
            });
        }
        
        if (updateResult === 0) {
          console.error(`[PaymentWebhook] Insufficient stock for SKU ${reservation.skuId}. Initiating REFUND.`);
          
          const PaymentAdapter = require('../adapters/payment.adapter');
          try {
              await PaymentAdapter.refundPayment(String(paymentId), null, sale.currencyCode);
              
              await tx.paymentTransaction.update({
                where: { id: transaction.id },
                data: { status: 'REFUNDED' }
              });
          } catch (refundError) {
              console.error(`[PaymentWebhook] CRITICAL: Refund failed for ${paymentId}. Manual intervention required.`);
              await tx.paymentTransaction.update({
                where: { id: transaction.id },
                data: { status: 'FAILED_REFUND_ERROR' } 
              });
          }

          throw new Error(`Insufficient stock for SKU ${reservation.skuId}. Payment refunded.`);
        }
        
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { released: true }
        });
        
      }
      
      await tx.sale.update({
        where: { id: sale.id },
        data: { 
          paymentStatus: 'PAID',
          mpPaymentId: String(paymentId),
          updatedAt: new Date()
        }
      });
      
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { 
          status: 'COMPLETED', 
          processedAt: new Date() 
        }
      });
      
      return { status: 'SUCCESS', saleId: sale.id };
      
    }, {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: 'Serializable'
    });

    if (result.status === 'SUCCESS') {
        const SaleService = require('./sale.service');
        setImmediate(async () => {
            try {
                await SaleService.processPostPaymentActions(result.saleId);
            } catch (e) {
                console.error('[PaymentWebhook] Error processing post-payment actions:', e);
            }
        });
    }

    return result;
  }
  
  /**
   * Manejar pagos fallidos (opcional)
   * @param {string} paymentId
   * @param {number} saleId
   */
  async handlePaymentFailure(paymentId, saleId) {
    return await prisma.$transaction(async (tx) => {
      // Marcar transacción como fallida
      await tx.paymentTransaction.upsert({
        where: { paymentId: String(paymentId) },
        create: {
          paymentId: String(paymentId),
          saleId: saleId,
          status: 'FAILED',
          webhookPayload: { status: 'failed' },
          attempts: 1
        },
        update: {
          status: 'FAILED',
          processedAt: new Date()
        }
      });
      
      // Liberar reservas de stock
      const reservations = await tx.stockReservation.findMany({
        where: { saleId: saleId, released: false }
      });
      
      for (const reservation of reservations) {
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { released: true }
        });
      }
      
      // Actualizar estado de venta
      const sale = await tx.sale.update({
        where: { id: saleId },
        data: { 
          paymentStatus: 'REJECTED',
          observations: 'Payment rejected or cancelled'
        }
      });

      if (sale.pointsUsed > 0) {
          const alreadyRefunded = await tx.pointsHistory.findFirst({
              where: { reason: `Reembolso por pago fallido - Orden #${saleId}` }
          });
          
          if (!alreadyRefunded) {
              await tx.user.update({
                  where: { id: sale.userId },
                  data: { points: { increment: sale.pointsUsed } }
              });
              await tx.pointsHistory.create({
                  data: {
                      userId: sale.userId,
                      type: 'EARNED',
                      amount: sale.pointsUsed,
                      reason: `Reembolso por pago fallido - Orden #${saleId}`
                  }
              });
          }
      }
    }, {
      isolationLevel: 'Serializable'
    });
  }
}

module.exports = new PaymentWebhookService();
