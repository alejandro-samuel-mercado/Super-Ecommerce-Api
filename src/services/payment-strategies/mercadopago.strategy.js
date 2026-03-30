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
            console.warn('  MercadoPagoStrategy: Access Token not found.');
        }
    }

    async createPreference(sale, user) {
        if (!this.client) throw new Error('MercadoPago Provider not configured');

        const preference = new Preference(this.client);
        const items = [];

       
        const prisma = require('../../config/prisma');
        const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
        const storeName = storeConfig?.storeName || 'TIENDA ONLINE';

        const baseCurrency = this.config?.currencyCode || storeConfig?.baseCurrency;
        if (!baseCurrency) throw new Error('Payment Gateway currency not configured and Store base currency missing.');
        
        const targetCurrency = (sale.currencyCode || baseCurrency).toUpperCase();
        const isForeignCurrency = targetCurrency !== baseCurrency;
        const exchangeRate = sale.exchangeRateAtPurchase ? Number(sale.exchangeRateAtPurchase) : 1;

        const convertToTarget = (amount) => {
            if (!isForeignCurrency) return Number(amount);
           
            return Number(amount) / exchangeRate;
        };

        // Sólo usar totalInBaseCurrency si la moneda de la pasarela coincide con la moneda base
        const targetTotal = (isForeignCurrency && sale.totalInBaseCurrency && targetCurrency === baseCurrency) 
              ? Number(sale.totalInBaseCurrency) 
              : convertToTarget(sale.total);

        items.push({
            id: String(sale.id),
            title: `Orden #${sale.uuid || sale.id}`,
            quantity: 1,
            unit_price: parseFloat(targetTotal.toFixed(2)),
            currency_id: baseCurrency
        });

        const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
        if (baseUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
            console.warn('[MercadoPagoStrategy] FRONTEND_URL is localhost in production! This may cause invalid back_urls.');
        }
        const saleReference = user ? sale.id : (sale.uuid || sale.id);

        const preferenceBody = {
            items: items,
            payer: {
                email: user?.email || sale.customerEmail || 'invitado@misitio.com',
                name: user?.name || sale.customerName || 'Invitado'
            },
            external_reference: String(saleReference),
            back_urls: {
                success: `${baseUrl}/checkout/success?gateway=mercadopago&saleId=${saleReference}`,
                failure: `${baseUrl}/checkout/failure?gateway=mercadopago&saleId=${saleReference}`,
                pending: `${baseUrl}/checkout/pending?gateway=mercadopago&saleId=${saleReference}`
            },
            auto_return: "approved",
            statement_descriptor: "Tienda Online"
        };

        try {
            const result = await preference.create({ body: preferenceBody });
            return result.init_point;
        } catch (error) {
            console.error('MP Create Error:', error);
            // Si el error tiene una respuesta detallada de MP, mostrarla
            const mpError = error.cause || error.message || error;
            throw new Error(`Error de Mercado Pago: ${JSON.stringify(mpError)}`);
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
        
      
        const webhookSecret = this.config?.webhookSecret || process.env.MP_WEBHOOK_SECRET;
        if (webhookSecret) {
            const xSignature = headers['x-signature'];
            const xRequestId = headers['x-request-id'];
            
            if (!xSignature || !xRequestId) {
                console.error('[MercadoPago Webhook] Missing signature headers');
                throw new Error('Invalid signature');
            }

           
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
            console.warn('  [MercadoPago Webhook] Validation skipped: WEBHOOK_SECRET not configured.');
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
