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
            console.warn('⚠️ StripeStrategy: Secret Key not found.');
        }
    }

    async createPreference(sale, user) {
        if (!this.client) throw new Error('Stripe Provider not configured');

        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        const session = await this.client.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: sale.items.map(item => ({
                price_data: {
                    currency: (sale.currencyCode || 'usd').toLowerCase(),
                    product_data: {
                        name: item.productName || item.skuCode,
                    },
                    unit_amount: Math.round(item.unitPrice * 100),
                },
                quantity: item.quantity,
            })).concat(
                (sale.shippingCost > 0) ? [{
                    price_data: {
                        currency: (sale.currencyCode || 'usd').toLowerCase(),
                        product_data: { name: 'Envío' },
                        unit_amount: Math.round(sale.shippingCost * 100),
                    },
                    quantity: 1,
                }] : []
            ),
            mode: 'payment',
            client_reference_id: String(sale.id),
            customer_email: user.email,
            metadata: {
                saleId: String(sale.id),
            },
            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/checkout/failure`,
        });

        return session.url;
    }

    async refundPayment(paymentId, amount) {
        if (!this.client) throw new Error('Stripe Provider not configured');
        
        try {
            const refundParams = { payment_intent: paymentId };
            if (amount) refundParams.amount = Math.round(amount * 100);
            
            return await this.client.refunds.create(refundParams);
        } catch (error) {
            console.error(`Stripe Refund Error for ${paymentId}:`, error);
            throw error;
        }
    }

    async processWebhook(req) {
        if (!this.client) throw new Error('Stripe Provider not configured');
        
        const sig = req.headers['stripe-signature'];
        const webhookSecret = this.config?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
        
        let event;

        if (webhookSecret && sig) {
            try {
                // We need the raw body for signature verification.
                // Assuming express.raw() or compatible parser is used.
                event = this.client.webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret);
            } catch (err) {
                console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
                throw new Error(`Webhook Error: ${err.message}`);
            }
        } else {
            // Fallback for development IF secret is missing (not recommended)
            event = req.body;
        }
        
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            return {
                paymentId: session.id,
                status: 'approved',
                externalReference: session.metadata?.saleId || session.client_reference_id,
                raw: session
            };
        }
        
        return null;
    }
}

module.exports = StripeStrategy;
