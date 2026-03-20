const prisma = require('../config/prisma');
const MercadoPagoStrategy = require('./payment-strategies/mercadopago.strategy');
const StripeStrategy = require('./payment-strategies/stripe.strategy');
const PayPalStrategy = require('./payment-strategies/paypal.strategy');

class PaymentGatewayFactory {
  constructor() {
    this.strategies = {
      mercadopago: MercadoPagoStrategy,
      stripe: StripeStrategy,
      paypal: PayPalStrategy
    };
  }

  /**
   * Resuelve la pasarela de pago apropiada para una moneda dada.
   * @param {string} currencyCode 
   * @returns {Promise<PaymentStrategy>}
   */
  async getGateway(currencyCode) {
    // 1. Encontrar la Pasarela Primaria para esta moneda
    let gatewaySupport = await prisma.gatewayCurrencySupport.findFirst({
      where: {
        currencyCode: currencyCode,
        isPrimary: true,
        gateway: { isActive: true }
      },
      include: { gateway: true }
    });

    // 2. Si no es primaria, busca CUALQUIER pasarela activa para esta moneda
    if (!gatewaySupport) {
         gatewaySupport = await prisma.gatewayCurrencySupport.findFirst({
            where: {
                currencyCode: currencyCode,
                gateway: { isActive: true }
            },
            include: { gateway: true }
         });
    }

    // 3. Respaldo: Pasarela Global de Respaldo
    if (!gatewaySupport) {
      const fallbackGateway = await prisma.paymentGateway.findFirst({
        where: {
          isGlobalFallback: true,
          isActive: true
        } 
      });

      if (fallbackGateway) {
        // Retornar estrategia de respaldo
        return this._instantiateStrategy(fallbackGateway);
      }
    }

    if (!gatewaySupport) {
      throw new Error(`No payment gateway found for currency ${currencyCode}`);
    }

    return this._instantiateStrategy(gatewaySupport.gateway);
  }

  /**
   * Resuelve una pasarela de pago en especifico
   * @param {string} slug 
   * @returns {Promise<PaymentStrategy>}
   */
  async getGatewayBySlug(slug) {
    const gateway = await prisma.paymentGateway.findFirst({
      where: { slug, isActive: true }
    });

    if (!gateway) {
      throw new Error(`Gateway '${slug}' not found or inactive.`);
    }

    return this._instantiateStrategy(gateway);
  }

  async getAvailableGateways(currencyCode, customerCountry) {
      const options = [];

      const CurrencyService = require('./currency.service');
      const isLocal = await CurrencyService.isLocalCountry(customerCountry);

      const gateways = await prisma.paymentGateway.findMany({
          where: { isActive: true },
          include: { supportedCurrencies: true }
      });

      gateways.forEach(gw => {
          if (!gw.isActive) return;

          const support = gw.supportedCurrencies ? gw.supportedCurrencies.find(s => s.currencyCode === currencyCode) : null;
          const isPayPal = gw.slug === 'paypal';
          const isStripe = gw.slug === 'stripe';
          
          if (!support && !isPayPal && !isStripe) return;

          const isPrimary = support ? support.isPrimary : false;

          if (isLocal) {
              if (isPrimary || isPayPal) {
                  options.push({
                      id: gw.id,
                      name: gw.name,
                      slug: gw.slug,
                      type: isPrimary ? 'PRIMARY' : 'INTERNATIONAL',
                      isFallback: isPrimary
                  });
              }
          } else {
              if (isPayPal || isStripe) {
                  options.push({
                      id: gw.id,
                      name: gw.name,
                      slug: gw.slug,
                      type: 'INTERNATIONAL',
                      isFallback: false
                  });
              }
          }
      });

      return options;
  }

  _instantiateStrategy(gateway) {
    const StrategyClass = this.strategies[gateway.slug];
    if (!StrategyClass) {
      throw new Error(`Strategy for gateway slug '${gateway.slug}' not implemented.`);
    }
    return new StrategyClass(gateway.config);
  }
}

module.exports = new PaymentGatewayFactory();
