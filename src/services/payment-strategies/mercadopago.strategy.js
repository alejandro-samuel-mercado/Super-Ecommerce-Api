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
        // Config can come from DB or ENV. Prioritize DB config if passed.
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

        // Check currency. MP only supports ARS (mostly) for this region. 
        // We must ensure values are in ARS.
        // Logic migrated from PaymentAdapter to handle currency conversion.
        const baseCurrency = this.config?.currencyCode || 'ARS';
        const isForeignCurrency = sale.currencyCode && sale.currencyCode !== baseCurrency;
        const exchangeRate = sale.exchangeRateAtPurchase ? Number(sale.exchangeRateAtPurchase) : 1;

        const convertToTarget = (amount) => {
            if (!isForeignCurrency) return Number(amount);
            // If the sale is in a different currency, convert to ARS (baseCurrency)
            // exchangeRate is 'Currency to Base', so we divide if the sale currency is stronger or multiply?
            // Actually, SaleService already handles conversion to base.
            return Number(amount) / exchangeRate;
        };

        // 1. Items
        if (sale.items && sale.items.length > 0) {
            sale.items.forEach(item => {
                items.push({
                    id: String(item.skuId || item.id),
                    title: item.productName || item.skuCode || `Producto #${item.skuId}`,
                    quantity: parseInt(item.quantity),
                    unit_price: parseFloat(convertToTarget(item.unitPrice).toFixed(2)),
                    currency_id: baseCurrency
                });
            });
        } else {
            items.push({
                id: String(sale.id),
                title: `Orden #${sale.uuid || sale.id}`,
                quantity: 1,
                unit_price: convertToTarget(sale.subtotal || sale.total),
                currency_id: baseCurrency
            });
        }

        // 2. Discounts (Promotional)
        const totalDiscount = Number(sale.discount || 0);
        if (totalDiscount > 0) {
            items.push({
                id: 'discount',
                title: 'Descuentos Aplicados',
                quantity: 1,
                unit_price: -convertToTarget(totalDiscount),
                currency_id: baseCurrency
            });
        }

        // 2.5 Points Discount
        const pointsDiscount = Number(sale.pointsDiscount || 0);
        if (pointsDiscount > 0) {
            items.push({
                id: 'points_discount',
                title: 'Descuento por Puntos',
                quantity: 1,
                unit_price: -convertToTarget(pointsDiscount),
                currency_id: baseCurrency
            });
        }

        // 3. Shipping
        const shipping = Number(sale.shippingCost || 0);
        if (shipping > 0) {
            items.push({
                id: 'shipping',
                title: 'Costo de Envío',
                quantity: 1,
                unit_price: convertToTarget(shipping),
                currency_id: baseCurrency
            });
        }

        // 4. Tax
        const tax = Number(sale.taxAmount || sale.tax || 0);
        if (tax > 0) {
            items.push({
                id: 'tax',
                title: 'Impuestos',
                quantity: 1,
                unit_price: convertToTarget(tax),
                currency_id: baseCurrency
            });
        }

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
            binary_mode: true,
            statement_descriptor: "TIENDA MODELO"
        };

        // Validate Totals
        const targetTotal = (isForeignCurrency && sale.totalInBaseCurrency) 
              ? Number(sale.totalInBaseCurrency) 
              : convertToTarget(sale.total);
              
        const sumOfItems = items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);
          
        if (Math.abs(sumOfItems - targetTotal) > 0.1) {
             console.warn(`⚠️ Multi-item sum discrepancy (${sumOfItems} vs ${targetTotal}). Adjusting last item.`);
             const diff = targetTotal - sumOfItems;
             items[items.length - 1].unit_price += (diff / items[items.length - 1].quantity);
        }

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
        // --- End Signature Validation ---

        // MP format: ?id=123&topic=payment or body.data.id
        // V1: topic/id in query. V2: type/data.id in body.
        
        let paymentId = query.id || query['data.id'] || (body && body.data && body.data.id);
        const topic = query.topic || (body && body.type);

        if (!paymentId || (topic !== 'payment' && topic !== 'mp-payment')) {
            // Ignore non-payment events (like merchant_order) for now
            return null; 
        }

        try {
            console.log(`[MercadoPago] Fetching payment ${paymentId}...`);
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
