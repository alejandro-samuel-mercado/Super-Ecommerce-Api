const { Payment, MercadoPagoConfig } = require("mercadopago");
const prisma = require("../../config/prisma");

class MercadoPagoCustomStrategy {
    constructor() {
        this.name = "mercadopago_custom";
    }

    getCredentials() {
        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (!accessToken) {
            throw new Error(
                "Mercado Pago Access Token no configurado en variables de entorno."
            );
        }
        return { accessToken };
    }

    async createPreference(sale, user) {
        throw new Error(
            "mercadopago_custom no genera preferencias de redirección. Usa processPayment."
        );
    }

    async processPayment(sale, user, paymentData) {
        if (!paymentData || !paymentData.token) {
            throw new Error("Datos de pago insuficientes para Mercado Pago Custom. Se requiere el token del Brick.");
        }

        const { accessToken } = this.getCredentials();
        const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
        const client = new MercadoPagoConfig({
            accessToken,
            options: { timeout: 10000 },
        });
        const payment = new Payment(client);

        try {
            const body = {
                transaction_amount: Number(sale.total),
                token: paymentData.token,
                description: `Venta #${sale.id} - ${storeConfig.storeName || "Tienda"}`,
                installments: Number(paymentData.installments) || 1,
                payment_method_id: paymentData.payment_method_id,
                issuer_id: paymentData.issuer_id ? String(paymentData.issuer_id) : undefined,
                payer: {
                    email: user?.email || sale.customerEmail || paymentData.payer?.email,
                    identification: paymentData.payer?.identification,
                },
            };

            const response = await payment.create({ body });

            return {
                success: response.status === "approved" || response.status === "in_process",
                status: response.status,
                statusDetail: response.status_detail,
                paymentId: response.id?.toString(),
                transactionData: response,
            };
        } catch (error) {
            console.error("[MercadoPagoCustomStrategy] Error processing payment:", error);
            throw new Error(`Excepción en Mercado Pago: ${error.message || "Error desconocido"}`);
        }
    }

    async refundPayment(paymentId, amount) {
        const { accessToken } = this.getCredentials();
        const client = new MercadoPagoConfig({
            accessToken,
            options: { timeout: 10000 },
        });
        const payment = new Payment(client);

        try {
            const refund = await payment.refund({ id: paymentId, body: { amount } });
            return refund;
        } catch (error) {
            console.error("[MercadoPagoCustomStrategy] Error refunding:", error);
            throw new Error("No se pudo procesar el reembolso en Mercado Pago.");
        }
    }
}

module.exports = MercadoPagoCustomStrategy;
