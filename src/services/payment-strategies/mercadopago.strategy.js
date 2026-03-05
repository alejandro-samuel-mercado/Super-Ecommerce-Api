const PaymentStrategy = require('./payment.strategy');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const crypto = require('crypto');

class MercadoPagoStrategy extends PaymentStrategy {
    constructor(config) {
        super();
        this.config = config;
        this.client = null;
        this.init();
    }

    init() {
       
        const accessToken = this.config?.accessToken || process.env.MP_ACCESS_TOKEN;
        
        if (accessToken) {
            this.client = new MercadoPagoConfig({ accessToken });
        } else {
            console.warn('⚠️ MercadoPagoStrategy: Access Token not found.');
        }
    }

    async createPreference(sale, user) {
        if (!this.client) throw new Error('MercadoPago Provider not configured');

        const preference = new Preference(this.client);
        const items = [];

       
        const baseCurrency = this.config?.currencyCode || 'ARS';
        const isForeignCurrency = sale.currencyCode && sale.currencyCode !== baseCurrency;
        const exchangeRate = sale.exchangeRateAtPurchase ? Number(sale.exchangeRateAtPurchase) : 1;

        const prisma = require('../config/prisma');
        const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
        const storeName = storeConfig?.storeName || 'TIENDA ONLINE';

        const convertToTarget = (amount) => {
            if (!isForeignCurrency) return Number(amount);
           
            return Number(amount) / exchangeRate;
        };

        const targetTotal = (isForeignCurrency && sale.totalInBaseCurrency) 
              ? Number(sale.totalInBaseCurrency) 
              : convertToTarget(sale.total);

        items.push({
            id: String(sale.id),
            title: `Orden #${sale.uuid || sale.id}`,
            quantity: 1,
            unit_price: parseFloat(targetTotal.toFixed(2)),
            currency_id: baseCurrency
        });

        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const preferenceBody = {
            items: items,
            payer: {
                email: user.email,
                name: user.name
            },
            external_reference: String(sale.id),
            back_urls: {
                success: `${baseUrl}/checkout/success`,
                failure: `${baseUrl}/checkout/failure`,
                pending: `${baseUrl}/checkout/pending`
            },
            statement_descriptor: storeName.substring(0, 22)
        };

        try {
            const result = await preference.create({ body: preferenceBody });
            return result.init_point;
        } catch (error) {
            console.error('MP Create Error:', error);
            throw error;
        }
    }

    async refundPayment(paymentId, amount) {
         if (!this.client) throw new Error('MercadoPago Provider not configured');
         try {
            const payment = new Payment(this.client);
            if (amount) {
                return await payment.refund({ id: paymentId, body: { amount } });
            } else {
                return await payment.refund({ id: paymentId });
            }
         } catch (error) {
             console.error(`MP Refund Error for ${paymentId}:`, error);
             throw error;
         }
    }

    /**
     * Process incoming Webhook
     * MP Webhooks send a notification ID. We must fetch the actual payment data.
     * @param {object} req - Express Request object (query, body)
     */
    async processWebhook(req) {
        if (!this.client) throw new Error('MercadoPago Provider not configured');
        
        const { query, body, headers } = req;
        
        // --- Signature Validation ---
        const webhookSecret = this.config?.webhookSecret || process.env.MP_WEBHOOK_SECRET;
        if (webhookSecret) {
            const xSignature = headers['x-signature'];
            const xRequestId = headers['x-request-id'];
            
            if (!xSignature || !xRequestId) {
                console.error('[MercadoPago Webhook] Missing signature headers');
                throw new Error('Invalid signature');
            }

            // MP Signature format: ts=...,v1=...
            const parts = xSignature.split(',');
            let ts = '';
            let v1 = '';
            parts.forEach(part => {
                const [key, value] = part.split('=');
                if (key === 'ts') ts = value;
                if (key === 'v1') v1 = value;
            });

            const paymentId = query.id || (body && body.data && body.data.id);
            const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
            
            const hmac = crypto.createHmac('sha256', webhookSecret);
            hmac.update(manifest);
            const sha = hmac.digest('hex');

            if (sha !== v1) {
                console.error('[MercadoPago Webhook] Signature mismatch');
                throw new Error('Invalid signature');
            }
        } else {
            console.warn('⚠️ [MercadoPago Webhook] Validation skipped: WEBHOOK_SECRET not configured.');
        }
      
        
        let paymentId = query.id || query['data.id'] || (body && body.data && body.data.id);
        const topic = query.topic || (body && body.type);

        if (!paymentId || (topic !== 'payment' && topic !== 'mp-payment')) {
           
            return null; 
        }

        try {
        
            const paymentClient = new Payment(this.client);
            const paymentData = await paymentClient.get({ id: paymentId });
            
            return {
                paymentId: String(paymentData.id),
                status: paymentData.status,
                externalReference: paymentData.external_reference,
                raw: paymentData
            };
        } catch (error) {
            console.error(`[MercadoPago] Error fetching payment ${paymentId}:`, error);
            throw error;
        }
    }
}

module.exports = MercadoPagoStrategy;
