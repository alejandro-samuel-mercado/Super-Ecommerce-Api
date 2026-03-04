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

  /**
   * Devuelve todas las pasarelas activas
   * @param {string} currencyCode 
   * @returns {Promise<Array>} Lista de las meta datas de todos los gateways
   */
  async getAvailableGateways(currencyCode) {
      const options = [];

      // 1. Primaria por moneda
      const primarySupport = await prisma.gatewayCurrencySupport.findFirst({
          where: {
              currencyCode: currencyCode,
              isPrimary: true,
              gateway: { isActive: true }
          },
          include: { gateway: true }
      });

      if (primarySupport) {
          options.push({
              id: primarySupport.gateway.id,
              name: primarySupport.gateway.name,
              slug: primarySupport.gateway.slug,
              type: 'PRIMARY',
              isFallback: false
          });
      }

      // 2. Apoyo Global (si estrictamente hay la necesidad por una segunda version)
      const fallbackGateway = await prisma.paymentGateway.findFirst({
          where: {
              isGlobalFallback: true,
              isActive: true,
              // Excluir es una primaria (ej: caso de que paypal sea el principal USD, ignorarlo la proxima)
              id: primarySupport ? { not: primarySupport.gateway.id } : undefined
          }
      });

      if (fallbackGateway) {
          options.push({
              id: fallbackGateway.id,
              name: fallbackGateway.name,
              slug: fallbackGateway.slug,
              type: 'FALLBACK',
              isFallback: true
          });
      }

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
