class PaymentStrategy {
    constructor() {}
  
    /**
     * @param {Object} sale 
     * @param {Object} user 
     * @returns {Promise<string>} init_point
     */
    async createPreference(sale, user) {
      throw new Error("Method 'createPreference' must be implemented.");
    }
  
    /**
     * @param {string} paymentId 
     * @param {number} [amount] 
     * @returns {Promise<Object>}
     */
    async refundPayment(paymentId, amount) {
      throw new Error("Method 'refundPayment' must be implemented.");
    }
  }
  
  module.exports = PaymentStrategy;
  
