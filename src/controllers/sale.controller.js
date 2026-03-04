const prisma = require('../config/prisma');
const SaleService = require('../services/sale.service');
const InvoiceService = require('../services/invoice.service');
const CurrencyService = require('../services/currency.service');

class SaleController {

  async preview(req, res, next){
    try {
      // Calcular totales sin crear la venta
      const { items, couponCode, deliveryMethod, pointsToUse, paymentType } = req.body;
      
     
      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items are required' });
      }

      // Calcular totales usando el Servicio (obtiene precios reales)
      const userId = req.user?.id;
      const branchId = req.headers['x-branch-id'] || req.body.branchId;
      
      const currency = await CurrencyService.getCurrencyByContext(req);
      const data = await SaleService.previewSale({ 
          items, 
          couponCode, 
          deliveryMethod, 
          branchId,
          pointsToUse,
          paymentType,
          currency,
          customerIpCountry: (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase()
      }, userId);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const { id: loggedUserId, role } = req.user;
      const roleName = role.name || role;

      let targetUserId = loggedUserId;

      // Permitir que el personal asigne ventas a clientes específicos (Modo POS)
      if (['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'].includes(roleName) && req.body.clientId) {
          targetUserId = req.body.clientId;
      }

      let employeeId = null;
      if (['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'].includes(roleName)) {
           employeeId = loggedUserId;
      }



      const branchId = req.headers['x-branch-id'] || req.body.branchId;
      const currency = await CurrencyService.getCurrencyByContext(req);
      const customerIpCountry = (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase();
      const saleData = { ...req.body, employeeId, pointsToUse: req.body.pointsToUse || 0, branchId, currency, customerIpCountry };

      // VERIFICACIÓN DE IDEMPOTENCIA (Lógica)
      // Evitar órdenes por doble clic. Verificar si el mismo usuario creó el mismo pedido (total) en los últimos 30 segundos.
      if (targetUserId) {
          const recentSale = await SaleService.findRecentDuplicate(targetUserId, saleData.items);
          if (recentSale) {
              return res.status(200).json({ 
                  success: true, 
                  message: 'Venta registrada con exito!',
                  data: recentSale 
              });
          }
      }

      const sale = await SaleService.createSale(targetUserId, saleData);
      
      res.status(201).json({ 
          success: true, 
          message: 'Venta registrada con exito!',
          data: sale 
      });
    } catch (error) {
      const knownErrors = ['Insufficient stock', 'stock', 'Coupon', 'coupon', 'Points', 'points', 'address', 'shipping', 'branch', 'transfer', 'Cart', 'cart'];
      if (knownErrors.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()))) {
          return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async getOne(req, res, next) {
      try {
          const { id } = req.params;
          const { id: userId, role: userRole } = req.user;
          const roleName = userRole.name || userRole; 

          const sale = await SaleService.getSaleById(id, userId, roleName);
          res.json({ success: true, data: sale });
      } catch (error) {
          if (error.message.includes('Permission denied')) return res.status(403).json({ success: false, message: error.message });
          if (error.message.includes('not found')) return res.status(404).json({ success: false, message: error.message });
          next(error);
      }
  }

  async getAll(req, res, next) {
    try {
        const branchId = req.query.branchId || req.headers['x-branch-id'];
        const { paymentStatus, isAbandoned, isCancelled } = req.query;
        
        const sales = await SaleService.getAllSales({ 
            branchId, 
            paymentStatus, 
            isAbandoned,
            isCancelled
        }); 
        res.json({ success: true, data: sales });
    } catch (error) {
        next(error);
    }
  }

  async getMySales(req, res, next) {
      try {
          const { includePending } = req.query;
          const sales = await SaleService.getUserSales(req.user.id, includePending === 'true');
          res.json({ success: true, data: sales });
      } catch (error) {
          next(error);
      }
  }

  async getInvoice(req, res, next) {
      try {
          const { id } = req.params;
          const { id: userId, role: userRole } = req.user;
          const roleName = userRole.name || userRole;

          const sale = await SaleService.getSaleById(id, userId, roleName);

          const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });

          const pdfBuffer = await InvoiceService.generateInvoicePDF(sale, config);

          res.set({
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename=invoice-${sale.uuid || sale.id}.pdf`,
              'Content-Length': pdfBuffer.length
          });
          
          res.send(pdfBuffer);

      } catch (error) {
          next(error);
      }
  }

  async update(req, res, next) {
    try {
        const { id } = req.params;
        const { id: userId, role } = req.user;
        const roleName = role.name || role;

        const updatedSale = await SaleService.updateSale(id, req.body, roleName, userId);

        res.json({ success: true, data: updatedSale });
    } catch (error) {
        if (error.message.includes('Permission denied') || error.message.includes('No permitido')  || error.message.includes('No puede modificar')) {
             return res.status(400).json({ success: false, message: error.message });
        }
        console.error('[SaleController] Update Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async refund(req, res, next) {
      try {
          const { id } = req.params;
          const { reason } = req.body;
          const { id: adminId } = req.user;
          const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

          const AdminSaleService = require('../services/admin-sale.service');
          const refundedSale = await AdminSaleService.refundSale(adminId, id, reason, ip);

          res.json({ success: true, data: refundedSale });
      } catch (error) {
          next(error);
      }
  }
}

module.exports = new SaleController();
