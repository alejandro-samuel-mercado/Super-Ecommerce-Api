const PaymentStrategy = require('./payment.strategy');

class PayPalStrategy extends PaymentStrategy {
    constructor(config) {
        super();
        this.config = config;
        // this.client = new PayPal(config.clientId, config.clientSecret);
    }

    async createPreference(sale, user) {
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
        return `https://www.paypal.com/checkoutnow?token=MOCK_TOKEN&total=${targetTotal}&currency=${targetCurrency}&saleId=${sale.id}`;
    }

    async refundPayment(paymentId, amount) {
        console.log(`[PayPal] Refunding ${paymentId}`);
        return { status: 'REFUNDED', id: `refund_${Date.now()}` }; 
    }
}

module.exports = PayPalStrategy;
