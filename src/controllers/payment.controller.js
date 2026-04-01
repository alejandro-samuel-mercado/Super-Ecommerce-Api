const PaymentGatewayFactory = require('../services/payment.factory');
const prisma = require('../config/prisma');

class PaymentController {
  
  /**
   * GET /api/payments/options?currency=USD
   */
  async getPaymentOptions(req, res) {
    try {
      let { currency, country } = req.query;
      if (!currency) {
        return res.status(400).json({ error: 'Código de moneda es requerido' });
      }

      // Si no viene país por query, intentar detectar por IP
      if (!country) {
        const CurrencyService = require('../services/currency.service');
        country = CurrencyService.getCountryByContext(req);
      }

      const options = await PaymentGatewayFactory.getAvailableGateways(currency, country);
      console.log('--- DEBUG PAYMENT OPTIONS ---', options);
      
      return res.json({
        success: true,
        data: options
      });
    } catch (error) {
      console.error('Get Payment Options Error:', error);
      return res.status(500).json({ error: 'Error al obtener las opciones de pago' });
    }
  }

  /**
   * POST /api/payments/initiate
   * Body: { saleId, gatewaySlug }
   */
  async initiatePayment(req, res) {
    try {
        const { saleId, gatewaySlug } = req.body;
        const userId = req.user.id; 

        if (!saleId) {
            return res.status(400).json({ error: 'ID de venta es requerido' });
        }

        const PaymentService = require('../services/payment.service');
        const initPoint = await PaymentService.initiatePayment(saleId, userId, gatewaySlug);

        return res.json({
            success: true,
            initPoint
        });
    } catch (error) {
        console.error('Initiate Payment Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Error al iniciar el pago' 
        });
    }
  }

  // --- ADMIN METHODS ---

  /**
   * GET /api/payments/admin/gateways
   */
  async getAllGateways(req, res) {
    try {
        const gateways = await prisma.paymentGateway.findMany({
            orderBy: { id: 'asc' }
        });
        return res.json({ success: true, data: gateways });
    } catch (error) {
        console.error('Get All Gateways Error:', error);
        return res.status(500).json({ error: 'Error al obtener las pasarelas' });
    }
  }

  /**
   * PUT /api/payments/admin/gateways/:id
   */
  async updateGateway(req, res) {
      try {
          const { id } = req.params;
          const { name, isActive, isGlobalFallback, config } = req.body;
          const data = {};
          if (name !== undefined) data.name = name;
          if (isActive !== undefined) data.isActive = isActive;
          if (isGlobalFallback === true) {
              await prisma.paymentGateway.updateMany({
                  where: { id: { not: parseInt(id) } },
                  data: { isGlobalFallback: false }
              });
          }
          
          const updated = await prisma.paymentGateway.update({
              where: { id: parseInt(id) },
              data
          });

          return res.json({ success: true, data: updated });
      } catch (error) {
          console.error('Update Gateway Error:', error);
          return res.status(500).json({ error: 'Error al actualizar la pasarela' });
      }
  }

  /**
   * GET /api/payments/admin/gateways/currency-support
   */
  async getCurrencySupport(req, res) {
      try {
          const support = await prisma.gatewayCurrencySupport.findMany({
              include: { gateway: true }
          });
          return res.json({ success: true, data: support });
      } catch (error) {
           console.error('Get Support Error:', error);
           return res.status(500).json({ error: 'Error al obtener el soporte de divisas' });
      }
  }

  /**
   * POST /api/payments/admin/gateways/currency-support
   * Set a Primary gateway for a currency
   */
  async updateCurrencySupport(req, res) {
      try {
          const { currencyCode, gatewayId, isPrimary, isSecondary } = req.body;

          if (isPrimary) {
              await prisma.gatewayCurrencySupport.updateMany({
                  where: { currencyCode },
                  data: { isPrimary: false }
              });
          }

          if (isSecondary) {
              await prisma.gatewayCurrencySupport.updateMany({
                  where: { currencyCode },
                  data: { isSecondary: false }
              });
          }

          const support = await prisma.gatewayCurrencySupport.upsert({
              where: {
                  gatewayId_currencyCode: {
                      gatewayId: parseInt(gatewayId),
                      currencyCode
                  }
              },
              update: { 
                  ...(isPrimary !== undefined && { isPrimary }),
                  ...(isSecondary !== undefined && { isSecondary })
              },
              create: {
                  gatewayId: parseInt(gatewayId),
                  currencyCode,
                  isPrimary: isPrimary === true,
                  isSecondary: isSecondary === true
              }
          });

          return res.json({ success: true, data: support });
      } catch (error) {
          console.error('Update Support Error:', error);
          return res.status(500).json({ error: 'Error al actualizar el soporte de divisas' });
      }
  }
}

module.exports = new PaymentController();
