const prisma = require('../config/prisma');
const NotificationService = require('./notification.service');
const InAppNotificationService = require('./in-app-notification.service');

class PaymentWebhookService {
  
  async processPaymentWebhook(paymentId, webhookData) {
    const result = await prisma.$transaction(async (tx) => {
      let transaction = await tx.paymentTransaction.findUnique({
        where: { paymentId: String(paymentId) },
        include: { sale: true }
      });
      
      if (transaction?.status === 'COMPLETED') {
        return { status: 'DUPLICATE', saleId: transaction.saleId };
      }
      
      const saleId = parseInt(webhookData.external_reference);
      if (!saleId || isNaN(saleId)) {
        throw new Error('Invalid external_reference in webhook data');
      }
      
      if (!transaction) {
        transaction = await tx.paymentTransaction.create({
          data: {
            paymentId: String(paymentId),
            saleId: saleId,
            status: 'PROCESSING',
            webhookPayload: webhookData,
            attempts: 1
          },
          include: { sale: true }
        });
      } else {
        transaction = await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { 
            attempts: { increment: 1 },
            webhookPayload: webhookData
          },
          include: { sale: true }
        });
      }
      
      let sale = transaction.sale;
      if (!sale) {
        sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { items: true, user: true }
        });
      } else {
        sale = await tx.sale.findUnique({
          where: { id: sale.id },
          include: { items: true, user: true }
        });
      }
      
      if (!sale) {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' }
        });
        throw new Error(`Sale ${saleId} not found for payment ${paymentId}`);
      }
      
      if (sale.paymentStatus === 'PAID') {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: 'COMPLETED', processedAt: new Date() }
        });
        return { status: 'ALREADY_PAID', saleId: sale.id };
      }

      const outOfStockItems = [];

      for (const item of sale.items) {
        const bi = await tx.branchInventory.findFirst({
          where: { skuId: item.skuId, branchId: sale.branchId }
        });

        if (!bi || Number(bi.stock) < Number(item.quantity)) {
          outOfStockItems.push({
            productName: item.productName,
            skuId: item.skuId,
            requested: Number(item.quantity),
            available: bi ? Number(bi.stock) : 0
          });
          continue;
        }

        await tx.$executeRaw`
          UPDATE "BranchInventory"
          SET stock = stock - ${Number(item.quantity)},
              "soldQuantity" = "soldQuantity" + ${Number(item.quantity)},
              "updatedAt" = NOW()
          WHERE id = ${bi.id} AND stock >= ${Number(item.quantity)}
        `;

        await tx.$executeRaw`
          UPDATE "SKU"
          SET stock = stock - ${Number(item.quantity)},
              "soldQuantity" = "soldQuantity" + ${Number(item.quantity)},
              "updatedAt" = NOW()
          WHERE id = ${item.skuId}
        `;

        const updatedInv = await tx.branchInventory.findUnique({ where: { id: bi.id } });
        await tx.stockMovement.create({
          data: {
            skuId: item.skuId,
            branchId: sale.branchId,
            type: 'SALE',
            quantity: -Number(item.quantity),
            resultingStock: updatedInv ? Number(updatedInv.stock) : 0,
            referenceId: `SALE-${sale.id}`,
            userId: sale.userId,
            notes: `Pago online confirmado - Venta #${sale.id}`
          }
        });
      }

      const hasStockIssue = outOfStockItems.length > 0;

      const observations = hasStockIssue
        ? `${sale.observations ? sale.observations + ' | ' : ''}SIN STOCK: ${outOfStockItems.map(i => `${i.productName} (pedido: ${i.requested}, disponible: ${i.available})`).join(', ')}`
        : sale.observations;

      await tx.sale.update({
        where: { id: sale.id },
        data: { 
          paymentStatus: 'PAID',
          deliveryStatus: hasStockIssue ? 'REQUIRES_ACTION' : sale.deliveryStatus,
          mpPaymentId: String(paymentId),
          observations,
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
      
      return { 
        status: 'SUCCESS', 
        saleId: sale.id, 
        hasStockIssue, 
        outOfStockItems,
        sale
      };
      
    }, {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: 'Serializable'
    });

    if (result.status === 'SUCCESS') {
      const SaleService = require('./sale.service');
      
      if (result.hasStockIssue) {
        setImmediate(async () => {
          try {
            const itemList = result.outOfStockItems
              .map(i => `• ${i.productName}: pedido ${i.requested}, disponible ${i.available}`)
              .join('\n');
            
            InAppNotificationService.emitAdminNotification(
              'error',
              'Venta Pagada Sin Stock',
              `Venta #${result.saleId} fue pagada pero hay productos sin stock disponible. Se requiere acción manual (reembolso o reposición).`,
              { saleId: result.saleId, outOfStockItems: result.outOfStockItems }
            );

            if (result.sale?.userId) {
              await InAppNotificationService.createNotification(
                result.sale.userId,
                'ORDER',
                `Problema con tu pedido #${result.saleId}`,
                `Tu pago fue recibido exitosamente, pero algunos productos de tu pedido no tienen stock disponible en este momento. Nos pondremos en contacto contigo para ofrecerte una solución.`,
                { url: `/profile` }
              );
            }

            const customerEmail = result.sale?.user?.email || result.sale?.customerEmail;
            if (customerEmail) {
              await NotificationService.sendEmail(
                customerEmail,
                `Actualización sobre tu pedido #${result.saleId}`,
                `<div style="font-family: sans-serif; color: #374151; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #F59E0B; padding: 24px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Actualización de tu pedido</h1>
                    </div>
                    <div style="padding: 24px;">
                        <p>Hola <strong>${result.sale?.user?.name || result.sale?.customerName || 'Cliente'}</strong>,</p>
                        <p>Hemos recibido tu pago para la orden <strong>#${result.saleId}</strong>. Sin embargo, algunos productos de tu pedido no tienen stock disponible en este momento.</p>
                        <p>Nuestro equipo se pondrá en contacto contigo a la brevedad para ofrecerte una solución (reembolso parcial, producto alternativo o espera de reposición).</p>
                        <p>Lamentamos las molestias y agradecemos tu paciencia.</p>
                    </div>
                    <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
                        Este es un correo automático, por favor no lo respondas.
                    </div>
                </div>`
              );
            }
          } catch (e) {
            console.error('[PaymentWebhook] Error sending out-of-stock notifications:', e);
          }
        });
      } else {
        setImmediate(async () => {
          try {
            await SaleService.processPostPaymentActions(result.saleId);
          } catch (e) {
            console.error('[PaymentWebhook] Error processing post-payment actions:', e);
          }
        });
      }
    }

    return result;
  }
  
  async handlePaymentFailure(paymentId, saleId) {
    return await prisma.$transaction(async (tx) => {
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

      const sale = await tx.sale.update({
        where: { id: saleId },
        data: { 
          paymentStatus: 'REJECTED',
          observations: 'Payment rejected or cancelled'
        }
      });

      if (sale.couponId) {
          await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE id = ${sale.couponId}`;
      }

      if (sale.pointsUsed > 0) {
          const alreadyRefunded = await tx.pointsHistory.findFirst({
              where: { userId: sale.userId, type: 'EARNED', reason: { contains: `#${saleId}` } }
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

  async handlePendingPayment(paymentId, webhookData) {
    const saleId = parseInt(webhookData.external_reference);
    if (!saleId || isNaN(saleId)) return;

    await prisma.paymentTransaction.upsert({
      where: { paymentId: String(paymentId) },
      create: {
        paymentId: String(paymentId),
        saleId: saleId,
        status: 'PROCESSING',
        webhookPayload: webhookData,
        attempts: 1
      },
      update: {
        webhookPayload: webhookData,
        attempts: { increment: 1 }
      }
    });

    await prisma.sale.update({
      where: { id: saleId },
      data: { 
        mpPaymentId: String(paymentId),
        updatedAt: new Date()
      }
    });
  }
}

module.exports = new PaymentWebhookService();
