const PaymentStrategy = require('./payment.strategy');
const Stripe = require('stripe');

class StripeStrategy extends PaymentStrategy {
    constructor(config) {
        super();
        this.config = config;
        this.client = null;
        this.init();
    }

    init() {
        const secretKey = this.config?.secretKey || process.env.STRIPE_SECRET_KEY;
        if (secretKey) {
            this.client = new Stripe(secretKey);
        } else {
            console.warn('  StripeStrategy: Secret Key not found.');
        }
    }

    async createPreference(sale, user) {
        if (!this.client) throw new Error('Stripe Provider not configured');

        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        const prisma = require('../../config/prisma');
        const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
        const baseCurrency = config?.baseCurrency;
        if (!baseCurrency) throw new Error('Store base currency not configured.');

        const targetCurrency = (this.config?.currencyCode || sale.currencyCode).toLowerCase();
        const saleCurrency = (sale.currencyCode).toUpperCase();

        const isForeignCurrency = saleCurrency !== (this.config?.currencyCode || saleCurrency);
        const exchangeRate = sale.exchangeRateAtPurchase ? Number(sale.exchangeRateAtPurchase) : 1;

        const targetTotal = (isForeignCurrency && sale.totalInBaseCurrency)
            ? Number(sale.totalInBaseCurrency)
            : (isForeignCurrency ? Number(sale.total) / exchangeRate : Number(sale.total));

        const convertToTarget = (amount) => {
            if (!isForeignCurrency) return Number(amount);
            return (Number(amount) / Number(sale.total)) * targetTotal;
        };

        const lineItems = [];

        const itemsAndDiscounts = Number(sale.subtotal) - Number(sale.discount) - Number(sale.pointsDiscount || 0);
        lineItems.push({
            price_data: {
                currency: targetCurrency,
                product_data: { name: `Subtotal (Orden #${sale.uuid || sale.id})` },
                unit_amount: Math.round(convertToTarget(itemsAndDiscounts) * 100),
            },
            quantity: 1,
        });

        if (Number(sale.shippingCost) > 0) {
            lineItems.push({
                price_data: {
                    currency: targetCurrency,
                    product_data: { name: 'Costo de Envío' },
                    unit_amount: Math.round(convertToTarget(sale.shippingCost) * 100),
                },
                quantity: 1,
            });
        }

        if (Number(sale.taxAmount) > 0) {
            lineItems.push({
                price_data: {
                    currency: targetCurrency,
                    product_data: { name: 'Impuestos (IVA)' },
                    unit_amount: Math.round(convertToTarget(sale.taxAmount) * 100),
                },
                quantity: 1,
            });
        }

        const sumCents = lineItems.reduce((acc, item) => acc + item.price_data.unit_amount, 0);
        const expectedCents = Math.round(targetTotal * 100);
        const diff = expectedCents - sumCents;
        
        if (diff !== 0 && lineItems.length > 0) {
            lineItems[0].price_data.unit_amount += diff;
        }

        const session = await this.client.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            client_reference_id: String(sale.id),
            customer_email: user.email,
            metadata: {
                saleId: String(sale.id),
            },
            success_url: `${baseUrl}/checkout/success?gateway=stripe&session_id={CHECKOUT_SESSION_ID}&saleId=${sale.id}`,
            cancel_url: `${baseUrl}/checkout/failure?gateway=stripe&saleId=${sale.id}`,
        });

        return session.url;
    }

    async refundPayment(paymentId, amount) {
        if (!this.client) throw new Error('Stripe Provider not configured');
        
        const refundParams = { payment_intent: paymentId };
        if (amount) refundParams.amount = Math.round(amount * 100);
        
        return await this.client.refunds.create(refundParams);
    }

    async processWebhook(req) {
        if (!this.client) throw new Error('Stripe Provider not configured');
        
        const sig = req.headers['stripe-signature'];
        const webhookSecret = this.config?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
        
        let event;

        if (webhookSecret && sig) {
            try {
                event = this.client.webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret);
            } catch (err) {
                console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
                throw new Error(`Webhook Error: ${err.message}`);
            }
        } else {
            event = req.body;
        }
        
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            return {
                paymentId: session.payment_intent || session.id,
                status: 'approved',
                externalReference: session.metadata?.saleId || session.client_reference_id,
                raw: { ...session, external_reference: session.metadata?.saleId || session.client_reference_id }
            };
        }
        
        return null;
    }
}

module.exports = StripeStrategy;
