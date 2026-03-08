const PaymentStrategy = require('./payment.strategy');
const paypal = require('@paypal/checkout-server-sdk');

class PayPalStrategy extends PaymentStrategy {
    constructor(config) {
        super();
        this.config = config;
        this.init();
    }

    init() {
        let clientId = (this.config?.clientId || process.env.PAYPAL_CLIENT_ID || '').trim();
        let clientSecret = (this.config?.clientSecret || process.env.PAYPAL_CLIENT_SECRET || '').trim();
        const rawMode = (this.config?.mode || process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
        const mode = (rawMode === 'production' || rawMode === 'live') ? 'live' : 'sandbox';

        if (clientId && clientSecret) {
            console.log(`[PayPal] Initializing in ${mode} mode`);
            console.log(`[PayPal] Client ID: ${clientId.substring(0, 5)}...${clientId.substring(clientId.length - 5)}`);
            console.log(`[PayPal] Secret: ${clientSecret.substring(0, 5)}...${clientSecret.substring(clientSecret.length - 5)}`);

            const environment = mode === 'live'
                ? new paypal.core.LiveEnvironment(clientId, clientSecret)
                : new paypal.core.SandboxEnvironment(clientId, clientSecret);
            this.client = new paypal.core.PayPalHttpClient(environment);
        } else {
            console.warn('[PayPal] PayPalStrategy: Client ID or Secret not found.');
        }
    }

    async createPreference(sale, user) {
        if (!this.client) throw new Error('PayPal Provider not configured');

        console.log(`[PayPal] Creating Payment for Sale #${sale.id} in ${sale.currencyCode}`);
        
        const targetCurrency = (this.config?.currencyCode || sale.currencyCode).toUpperCase();
        const saleCurrency = (sale.currencyCode).toUpperCase();
        const isForeignCurrency = saleCurrency !== targetCurrency;
        const exchangeRate = sale.exchangeRateAtPurchase ? Number(sale.exchangeRateAtPurchase) : 1;

        const convertToTarget = (amount) => {
            if (!isForeignCurrency) return Number(amount);
            return Number(amount) / exchangeRate;
        };

        const targetTotal = (isForeignCurrency && sale.totalInBaseCurrency)
            ? Number(sale.totalInBaseCurrency)
            : convertToTarget(sale.total);

        console.log(`[PayPal] Final Target Amount: ${targetTotal} ${targetCurrency}`);
        
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: String(sale.id),
                amount: {
                    currency_code: targetCurrency,
                    value: targetTotal.toFixed(2)
                },
                description: `Orden #${sale.uuid || sale.id}`
            }],
            application_context: {
                brand_name: process.env.STORE_NAME || 'Super E-commerce',
                landing_page: 'BILLING',
                user_action: 'PAY_NOW',
                return_url: `${baseUrl}/checkout/success?gateway=paypal&saleId=${sale.id}`,
                cancel_url: `${baseUrl}/checkout/failure?gateway=paypal&saleId=${sale.id}`
            }
        });

        try {
            const response = await this.client.execute(request);
            const approvalUrl = response.result.links.find(link => link.rel === 'approve').href;
            return approvalUrl;
        } catch (err) {
            console.error('[PayPal] Error creating order:', err);
            throw new Error(`PayPal Error: ${err.message}`);
        }
    }

    async refundPayment(paymentId, amount) {
        console.log(`[PayPal] Refunding ${paymentId}`);
        // TODO: Implement real refund if needed
        return { status: 'REFUNDED', id: `refund_${Date.now()}` }; 
    }
}

module.exports = PayPalStrategy;
