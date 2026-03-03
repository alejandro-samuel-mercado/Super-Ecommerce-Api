const PaymentStrategy = require('./payment.strategy');

class PayPalStrategy extends PaymentStrategy {
    constructor(config) {
        super();
        this.config = config;
        // this.client = new PayPal(config.clientId, config.clientSecret);
    }

    async createPreference(sale, user) {
        console.log(`__PayPal__ Creating Payment for Sale #${sale.id} in ${sale.currencyCode || 'USD'}`);
        
  
        return 'https://www.paypal.com/checkoutnow?token=EC-ResultMock';
    }

    async refundPayment(paymentId, amount) {
        console.log(`__PayPal__ Refunding ${paymentId}`);
        return { status: 'REFUNDED', id: `refund_${Date.now()}` }; 
    }
}

module.exports = PayPalStrategy;
