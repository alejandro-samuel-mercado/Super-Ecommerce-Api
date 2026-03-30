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

        const SUPPORTED_CURRENCIES = ['USD', 'MXN', 'EUR', 'BRL', 'CAD', 'GBP', 'ILS', 'HKD', 'JPY', 'SGD', 'CHF', 'TWD', 'THB', 'PHP', 'PLN', 'NOK', 'DKK', 'SEK', 'HUF', 'CZK'];
        const baseCurrency = (this.config?.baseCurrency || process.env.BASE_CURRENCY || 'USD').toUpperCase();
        let targetCurrency = (sale.currencyCode || baseCurrency).toUpperCase();
        
        let shouldForceUSD = !SUPPORTED_CURRENCIES.includes(targetCurrency);
        if (shouldForceUSD) {
            targetCurrency = 'USD';
        }

        const isForeignCurrency = (sale.currencyCode || baseCurrency).toUpperCase() !== targetCurrency || (sale.currencyCode || baseCurrency).toUpperCase() !== baseCurrency;
        const exchangeRate = sale.exchangeRateAtPurchase ? Number(sale.exchangeRateAtPurchase) : 1;

        const convertToTarget = (amount) => {
            if (!shouldForceUSD && !isForeignCurrency) return Number(amount);
            // If we forced USD, and the original was ARS, we should ideally use the exchange rate or totalInBaseCurrency
            return Number(amount) / exchangeRate;
        };

        // Sólo usar totalInBaseCurrency si la moneda de la pasarela coincide con la moneda base
        const targetTotal = (sale.totalInBaseCurrency && targetCurrency === baseCurrency) 
              ? Number(sale.totalInBaseCurrency) 
              : convertToTarget(sale.total);

     
        const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
        const saleReference = user ? sale.id : (sale.uuid || sale.id);

        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            payer: {
                name: {
                    given_name: (user?.name || sale.customerName || 'Invitado').split(' ')[0],
                    surname: (user?.name || sale.customerName || 'Invitado').split(' ').slice(1).join(' ') || ' '
                },
                email_address: user?.email || sale.customerEmail || 'invitado@misitio.com'
            },
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
                return_url: `${baseUrl}/checkout/success?gateway=paypal&saleId=${saleReference}`,
                cancel_url: `${baseUrl}/checkout/failure?gateway=paypal&saleId=${saleReference}`
            }
        });

        try {
            const response = await this.client.execute(request);
            const links = response.result.links;
            const approvalUrl = (links.find(link => link.rel === 'approve') || 
                                 links.find(link => link.rel === 'payer-action'))?.href;
            
            if (!approvalUrl) {
                console.error('[PayPal] No approval URL found in response:', JSON.stringify(links));
                throw new Error('PayPal Error: No approval URL found');
            }
            return approvalUrl;
        } catch (err) {
            console.error('[PayPal] Error creating order:', JSON.stringify(err, null, 2));
            
            let detailedMsg = err.message;
            if (err.statusCode === 400 && err._body) {
                try {
                    const body = JSON.parse(err._body);
                    detailedMsg = body.message || body.name || detailedMsg;
                    if (body.details) {
                        detailedMsg += ` (${body.details.map(d => d.issue).join(', ')})`;
                    }
                } catch (e) {}
            }
            
            throw new Error(`PayPal Error: ${detailedMsg}`);
        }
    }

    async refundPayment(paymentId, amount) {
       
        return { status: 'REFUNDED', id: `refund_${Date.now()}` }; 
    }
}

module.exports = PayPalStrategy;
