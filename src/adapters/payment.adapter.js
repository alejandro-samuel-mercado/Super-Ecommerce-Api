const PaymentGatewayFactory = require('../services/payment.factory');

class PaymentAdapter {
  
  /**
   * Crea una preferencia de pago usando la estrategia adecuada según la moneda.
   * @param {Object} sale 
   * @param {Object} user 
   * @param {string} [gatewaySlug] - Optional specific gateway to use
   * @returns {Promise<string>} URL de redirección
   */
  async createPreference(sale, user, gatewaySlug = null) {
      try {
          // 1. Resolver Strategy
          let strategy;
          if (gatewaySlug) {
              strategy = await PaymentGatewayFactory.getGatewayBySlug(gatewaySlug);
          } else {
              const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
              const currencyCode = sale.currencyCode || (config?.baseCurrency || 'USD');
              strategy = await PaymentGatewayFactory.getGateway(currencyCode);
          }
          
          // 2. Delegar creación
          return await strategy.createPreference(sale, user);
      } catch (error) {
          console.error('[PaymentAdapter] Create Preference Error:', error);
          throw error;
      }
  }

  /**
   * Reembolsa un pago.
   * @param {string} paymentId 
   * @param {number} [amount] 
   * @param {string} [currencyCode] - Necesario para saber qué gateway usar si no tenemos el objeto sale
   */
  async refundPayment(paymentId, amount, currencyCode) {
      if (!currencyCode) {
          const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
          currencyCode = config?.baseCurrency || 'USD';
      }
      try {
          const strategy = await PaymentGatewayFactory.getGateway(currencyCode);
          return await strategy.refundPayment(paymentId, amount);
      } catch (error) {
          console.error(`[PaymentAdapter] Refund Failed for ${paymentId}:`, error);
          throw error;
      }
  }
}

module.exports = new PaymentAdapter();
