const prisma = require("../config/prisma");
const InAppNotificationService = require("./in-app-notification.service");
const EventService = require("./event.service");

class SalePaymentService {
    async processPostPaymentActions(saleId) {
        const sale = await prisma.sale.findUnique({
            where: { id: parseInt(saleId) },
            include: {
                items: { include: { sku: { include: { product: true } } } },
                user: true,
            },
        });

        if (!sale) return;
        if (sale.paymentStatus !== "PAID") return;

        const storeConfig = await prisma.storeConfig.findFirst({
            where: { id: 1 },
        });

        setImmediate(async () => {
            try {
                if (sale.userId) {
                    await InAppNotificationService.createNotification(
                        sale.userId,
                        "ORDER",
                        `¡Pedido #${sale.id} Confirmado!`,
                        `Tu pago ha sido acreditado exitosamente.`,
                        { url: `/profile` },
                    );
                }

                const NotificationService = require("./notification.service");
                const InvoiceService = require("./invoice.service");

                const pdfBuffer = await InvoiceService.generateInvoicePDF(
                    sale,
                    storeConfig,
                );
                const storeName = storeConfig?.storeName || "Tienda Online";
                const emailSubject = `Factura de tu Compra #${sale.id} - ${storeName}`;
                const emailHtml = `
                <div style="font-family: sans-serif; color: #374151; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">¡Tu pago ha sido confirmado!</h1>
                    </div>
                    <div style="padding: 24px;">
                        <p>Hola <strong>${sale.user?.name || sale.customerName || "Cliente"}</strong>,</p>
                        <p>Te confirmamos que hemos recibido tu pago para la orden <strong>#${sale.id}</strong>.</p>
                        <p>Adjunto a este correo encontrarás tu <strong>factura oficial</strong> en formato PDF con todos los detalles de tu compra.</p>
                        <div style="margin: 24px 0; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                            <p style="margin: 0; font-size: 14px;"><strong>Total Pagado:</strong> ${sale.total} ${sale.currencyCode}</p>
                            <p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Método:</strong> ${sale.paymentType}</p>
                        </div>
                        <p>Estamos preparando tu pedido para que llegue a tus manos lo antes posible.</p>
                        <p>¡Gracias por elegirnos!</p>
                    </div>
                    <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
                        Este es un correo automático, por favor no lo respondas.
                    </div>
                </div>
             `;

                await NotificationService.sendEmail(
                    sale.user?.email || sale.customerEmail,
                    emailSubject,
                    emailHtml,
                    [
                        {
                            filename: `factura-${sale.uuid || sale.id}.pdf`,
                            content: pdfBuffer,
                            contentType: "application/pdf",
                        },
                    ],
                );
            } catch (e) {
                console.error(
                    `[SaleService] Failed to send post-payment notifications: ${e.message}`,
                );
            }
        });

        if (!storeConfig?.enablePoints || !sale.userId) return;

        const activeEvent = await EventService.getActiveEvent();
        const pointsEnabled = activeEvent
            ? activeEvent.pointsEnabled
            : (storeConfig.enablePoints ?? true);

        if (!pointsEnabled) return;

        let totalPointsEarned = 0;
        let spendingBaseForGeneric = 0;

        for (const item of sale.items) {
            const pointsReward = item.sku?.product?.pointsReward || 0;
            if (pointsReward > 0) {
                totalPointsEarned += pointsReward * Number(item.quantity);
            } else {
                spendingBaseForGeneric += Number(item.subtotalInBaseCurrency || 0);
            }
        }

        const pointsPerCurrency = storeConfig.pointsPerCurrency
            ? Number(storeConfig.pointsPerCurrency)
            : 0.001;
        if (pointsPerCurrency > 0) {
            const spendingPoints = Math.floor(
                spendingBaseForGeneric * pointsPerCurrency,
            );
            totalPointsEarned += spendingPoints;
        }

        if (totalPointsEarned > 0 && sale.user) {
            const existingHistory = await prisma.pointsHistory.findFirst({
                where: {
                    userId: sale.userId,
                    type: "EARNED",
                    reason: { contains: `#${sale.id}`, mode: 'insensitive' },
                },
            });

            if (!existingHistory) {
                await prisma.$transaction([
                    prisma.user.update({
                        where: { id: sale.userId },
                        data: { points: { increment: totalPointsEarned } },
                    }),
                    prisma.pointsHistory.create({
                        data: {
                            userId: sale.userId,
                            type: "EARNED",
                            amount: totalPointsEarned,
                            reason: `Compra #${sale.id}`,
                        },
                    }),
                ]);
            }
        }
    }
}

module.exports = new SalePaymentService();
