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
        
        // Bloquear fila SKU y deducir stock atómicamente
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
            // Sincronizar BranchInventory
            await tx.$executeRaw`
              UPDATE "BranchInventory"
              SET 
                stock = stock - ${reservation.quantity},
                "soldQuantity" = "soldQuantity" + ${reservation.quantity},
                "updatedAt" = NOW()
              WHERE id = ${reservation.branchInventoryId}
            `;
        }
        
        if (updateResult === 0) {
          // Deducción de stock falló - stock insuficiente
          console.error(`[PaymentWebhook] ❌ Insufficient stock for SKU ${reservation.skuId}. Initiating REFUND.`);
          
          const PaymentAdapter = require('../adapters/payment.adapter');
          try {
              await PaymentAdapter.refundPayment(String(paymentId), null, sale.currencyCode);
              
              await tx.paymentTransaction.update({
                where: { id: transaction.id },
                data: { status: 'REFUNDED' }
              });
          } catch (refundError) {
              console.error(`[PaymentWebhook] 💀 CRITICAL: Refund failed for ${paymentId}. Manual intervention required.`);
              // Marcamos como FAILED para revisión admin...
              await tx.paymentTransaction.update({
                where: { id: transaction.id },
                data: { status: 'FAILED_REFUND_ERROR' } 
              });
          }

          throw new Error(`Insufficient stock for SKU ${reservation.skuId}. Payment refunded.`);
        }
        
        // Marcar reserva como liberada
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { released: true }
        });
        
      }
      
      // Paso 7: Actualizar estado de venta a PAID
      await tx.sale.update({
        where: { id: sale.id },
        data: { 
          paymentStatus: 'PAID',
          mpPaymentId: String(paymentId),
          updatedAt: new Date()
        }
      });
      
      // Paso 8: Marcar transacción como completa
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { 
          status: 'COMPLETED', 
          processedAt: new Date() 
        }
      });
      

      // Paso 8.5: Disparar Acciones Post-Pago (Puntos, etc.)
      try {
          const SaleService = require('./sale.service');
          await SaleService.processPostPaymentActions(sale.id);
      } catch (e) {
          console.error('[PaymentWebhook] Error processing post-payment actions:', e);
          // No fallar webhook por esto, es efecto secundario
      }
      
      // Paso 9: Enviar email confirmación (async, fuera de transacción)
      setImmediate(async () => {
        if (sale.user?.email) {
          NotificationService.sendEmail(
            sale.user.email,
            '¡Pago Confirmado!',
            `<h1>Tu pago por la orden #${sale.uuid || sale.id} ha sido confirmado exitosamente.</h1>
             <p>Total: ${sale.currencyCode} ${sale.total}</p>
             <p>¡Gracias por tu compra!</p>`
          ).catch(err => console.error('[PaymentWebhook] Email error:', err));

          // Notificación In-App
          InAppNotificationService.createNotification(
             sale.userId,
             'ORDER',
             '¡Pago Confirmado!',
             `Hemos recibido tu pago para la orden #${sale.id}. Prepararemos tu envío a la brevedad.`,
             { url: `/profile/orders/${sale.id}` }
          ).catch(err => console.error('[PaymentWebhook] InApp Notification error:', err));
        }
      });
      
      return { status: 'SUCCESS', saleId: sale.id };
      
    }, {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: 'Serializable'
    });
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
      await tx.sale.update({
        where: { id: saleId },
        data: { 
          paymentStatus: 'REJECTED',
          observations: 'Payment rejected or cancelled'
        }
      });
    });
  }
}

module.exports = new PaymentWebhookService();
