const prisma = require('../config/prisma');
const SaleService = require('../services/sale.service');
const InvoiceService = require('../services/invoice.service');
const CurrencyService = require('../services/currency.service');
const UploadService = require('../services/upload.service');
const InAppNotificationService = require('../services/in-app-notification.service');
const { ensureAbsoluteUrl } = require('../utils/url.util');
const { sanitizeErrorMessage } = require('../utils/error-sanitizer');

const mapSaleUrls = (sale, req) => {
  if (!sale) return sale;
  const s = { ...sale };
  if (s.paymentProofUrl) s.paymentProofUrl = ensureAbsoluteUrl(s.paymentProofUrl, req);
  if (s.qrCodeUrl) s.qrCodeUrl = ensureAbsoluteUrl(s.qrCodeUrl, req);
  if (s.items && Array.isArray(s.items)) {
    s.items = s.items.map(item => {
      if (item.sku && item.sku.product) {
        item.sku.product = {
          ...item.sku.product,
          images: (item.sku.product.images || []).map(img => ensureAbsoluteUrl(img, req))
        };
      }
      return item;
    });
  }
  return s;
};

class SaleController {

  async preview(req, res, next){
    try {
      // Calcular totales sin crear la venta
      const { items, couponCode, deliveryMethod, pointsToUse, paymentType, manualDiscount, address } = req.body;
      
     
      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items are required' });
      }

      // Calcular totales usando el Servicio (obtiene precios reales)
      const userId = req.user?.id;
      const branchId = req.branchId;
      
      const currency = await CurrencyService.getCurrencyByContext(req);
      const data = await SaleService.previewSale({ 
          items, 
          couponCode, 
          deliveryMethod, 
          branchId,
          pointsToUse,
          paymentType,
          manualDiscount,
          currency,
          address,
          customerIpCountry: (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase()
      }, userId);

      res.json({ success: true, data });

    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const loggedUserId = req.user ? req.user.id : null;
      const role = req.user ? req.user.role : null;
      const roleName = role ? (role.name || role) : 'GUEST';

      let targetUserId = loggedUserId;
      // Permitir que el personal asigne ventas a clientes específicos (Modo POS)
      if (['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'].includes(roleName) && req.body.clientId) {
          targetUserId = req.body.clientId;
      }

      let employeeId = null;

      if (['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'].includes(roleName)) {
           employeeId = loggedUserId;
      }



      let branchId = req.branchId;
      if (roleName === 'EMPLOYEE') {
          const userProfile = await require('../services/user.service').getProfile(loggedUserId);
          if (userProfile && userProfile.branchId) {
              branchId = userProfile.branchId;
          }
      } else if (roleName === 'ADMIN') {
          const adminBranches = await require('../config/prisma').userBranch.findMany({ where: { userId: loggedUserId } });
          const allowedBranchIds = adminBranches.map(b => b.branchId);
          if (allowedBranchIds.length > 0 && (!branchId || !allowedBranchIds.includes(parseInt(branchId)))) {
              branchId = allowedBranchIds[0];
          }
      }

      const currencyCodeReq = req.body.currencyCode || req.headers['x-currency'];
      const currencyObj = currencyCodeReq 
          ? await CurrencyService.getCurrencyByCode(currencyCodeReq) 
          : await CurrencyService.getCurrencyByContext(req);
      
      const currency = currencyObj?.code || 'USD';

      const customerIpCountry = (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase();
      const saleData = { ...req.body, employeeId, pointsToUse: req.body.pointsToUse || 0, branchId, currency, customerIpCountry, ip: req.ip };

      // VERIFICACIÓN DE IDEMPOTENCIA (Lógica)
      // Evitar órdenes por doble clic. Verificar si el mismo usuario creó el mismo pedido (total) en los últimos 30 segundos.
      if (targetUserId) {
          const recentSale = await SaleService.findRecentDuplicate(targetUserId, saleData.items, currency);
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
      const knownErrors = ['Insufficient stock', 'stock', 'Coupon', 'coupon', 'Points', 'points', 'address', 'shipping', 'branch', 'transfer', 'Cart', 'cart', 'pago', 'payment', 'paypal'];
      if (knownErrors.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()))) {
          return res.status(400).json({ success: false, message: sanitizeErrorMessage(error) });
      }
      next(error);
    }
  }

  async getGuestSale(req, res, next) {
      try {
          const { uuid } = req.params;
          const sale = await SaleService.getSaleByUuid(uuid);
          res.json({ success: true, data: mapSaleUrls(sale, req) });
      } catch (error) {
          if (error.message.includes('inválido') || error.message.includes('no existe')) 
              return res.status(404).json({ success: false, message: error.message });
          next(error);
      }
  }

  async getGuestInvoice(req, res, next) {
      try {
          const { uuid } = req.params;
          const sale = await SaleService.getSaleByUuid(uuid);
          const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
          const pdfBuffer = await InvoiceService.generateInvoicePDF(sale, config);

          res.set({
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename=invoice-${sale.uuid || sale.id}.pdf`,
              'Content-Length': pdfBuffer.length
          });
          
          res.send(pdfBuffer);
      } catch (error) {
          if (error.message.includes('inválido') || error.message.includes('no existe')) 
              return res.status(404).json({ success: false, message: error.message });
          next(error);
      }
  }

  async getOne(req, res, next) {
      try {
          const { id } = req.params;
          const { id: userId, role: userRole } = req.user;
          const roleName = userRole.name || userRole; 

          const sale = await SaleService.getSaleById(id, userId, roleName);
          res.json({ success: true, data: mapSaleUrls(sale, req) });
      } catch (error) {
          if (error.message.includes('Permission denied')) return res.status(403).json({ success: false, message: error.message });
          if (error.message.includes('not found')) return res.status(404).json({ success: false, message: error.message });
          next(error);
      }
  }

  async getAll(req, res, next) {
    try {
        let branchId = req.branchId;
        let branchIds = null;
        const roleName = req.user.role.name || req.user.role;
        
        if (roleName === 'EMPLOYEE') {
             const userProfile = await require('../services/user.service').getProfile(req.user.id);
             if (userProfile && userProfile.branchId) {
                 branchId = userProfile.branchId;
             }
        } else if (roleName === 'ADMIN') {
             const adminBranches = await require('../config/prisma').userBranch.findMany({ where: { userId: req.user.id } });
             const allowedBranchIds = adminBranches.map(b => b.branchId);
             
             if (branchId) {
                 if (!allowedBranchIds.includes(parseInt(branchId))) {
                     branchId = allowedBranchIds.length > 0 ? allowedBranchIds[0] : null;
                 }
             } else {
                 branchIds = allowedBranchIds;
             }
        }

        const { paymentStatus, isAbandoned, isPendingPayment, isCancelled, deliveryType, paymentType, deliveryStatus, page, limit } = req.query;
        
        const result = await SaleService.getAllSales({ 
            branchId,
            branchIds,
            paymentStatus, 
            isAbandoned,
            isPendingPayment,
            isCancelled,
            deliveryType,
            paymentType,
            deliveryStatus,
            page,
            limit
        }); 
        const mappedResult = {
            ...result,
            data: result.data.map(s => mapSaleUrls(s, req))
        };
        res.json({ success: true, data: mappedResult });
    } catch (error) {
        next(error);
    }
  }

  async getMySales(req, res, next) {
      try {
          const { includePending } = req.query;
          const sales = await SaleService.getUserSales(req.user.id, includePending !== 'false');
          const mappedSales = sales.map(s => mapSaleUrls(s, req));
          res.json({ success: true, data: mappedSales });
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

  async uploadPaymentProof(req, res, next) {
    try {
      const { id } = req.params;
      const { id: userId } = req.user;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No se envió ningún archivo' });
      }

      const sale = await prisma.sale.findUnique({
        where: { id: parseInt(id) },
        include: { user: true }
      });

      if (!sale) {
        return res.status(404).json({ success: false, message: 'Venta no encontrada' });
      }

      if (sale.userId !== userId) {
        return res.status(403).json({ success: false, message: 'No tienes permiso para subir el comprobante de esta venta' });
      }

      if (sale.paymentStatus === 'PAID') {
          return res.status(400).json({ success: false, message: 'No se puede modificar el comprobante de una venta ya pagada' });
      }

      const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      const url = await UploadService.uploadImage(req.file.buffer, 'comprobantes', baseUrl);

      const updatedSale = await prisma.sale.update({
        where: { id: parseInt(id) },
        data: {
          paymentProofUrl: url,
          paymentProofUploadedAt: new Date()
        }
      });

      // Notificar a los administradores
      InAppNotificationService.emitAdminNotification(
          'PAYMENT_PROOF',
          'Nuevo Comprobante Recibido',
          `El cliente ${sale.user?.name || 'Anónimo'} ha subido un comprobante para la orden #${id}.`,
          { saleId: id, action: 'view_details' }
      ).catch(err => console.error('Error emitting admin notification:', err));

      res.status(200).json({
        success: true,
        message: 'Comprobante subido con éxito',
        data: { url }
      });
    } catch (error) {
      next(error);
    }
  }

  async deletePaymentProof(req, res, next) {
    try {
      const { id } = req.params;
      const { id: userId } = req.user;

      const sale = await prisma.sale.findUnique({
        where: { id: parseInt(id) }
      });

      if (!sale) {
        return res.status(404).json({ success: false, message: 'Venta no encontrada' });
      }

      if (sale.userId !== userId) {
        return res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta venta' });
      }

      if (sale.paymentStatus === 'PAID') {
        return res.status(400).json({ success: false, message: 'No se puede eliminar el comprobante de una venta ya pagada' });
      }

      await prisma.sale.update({
        where: { id: parseInt(id) },
        data: {
          paymentProofUrl: null,
          paymentProofUploadedAt: null
        }
      });

      res.json({ success: true, message: 'Comprobante eliminado con éxito' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin/Employee sube imagen QR de pago para una venta.
   * Solo permitido si paymentStatus !== 'PAID'.
   */
  async uploadQrImage(req, res, next) {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No se proporcionó una imagen' });
      }

      const sale = await prisma.sale.findUnique({
        where: { id: parseInt(id) },
        include: { user: { select: { email: true, name: true } } }
      });

      if (!sale) {
        return res.status(404).json({ success: false, message: 'Venta no encontrada' });
      }

      if (sale.paymentStatus === 'PAID') {
        return res.status(400).json({ success: false, message: 'No se puede modificar el QR de una venta ya pagada' });
      }

      const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      const url = await UploadService.uploadImage(req.file.buffer, 'qr-pagos', baseUrl);

      await prisma.sale.update({
        where: { id: parseInt(id) },
        data: { qrPaymentUrl: url }
      });

      // Enviar email al cliente notificando que el QR está listo
      if (sale.user?.email) {
        setImmediate(async () => {
          try {
            const NotificationService = require('../services/notification.service');
            const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
            const storeName = config?.storeName || 'Tienda Online';
            const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';

            const emailHtml = `
              <div style="font-family: sans-serif; color: #374151; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #1f2937;">¡Tu QR de pago está listo!</h1>
                <p>Hola <strong>${sale.user?.name || sale.customerName || 'Cliente'}</strong>,</p>
                <p>El código QR para tu pedido <strong>#${sale.id}</strong> ya está disponible.</p>
                <div style="margin: 20px 0; padding: 20px; background-color: #f0fdf4; border-radius: 12px; border: 2px solid #86efac; text-align: center;">
                  <p style="margin: 0 0 15px 0; font-weight: bold; color: #166534;">Escanea este código con tu app bancaria:</p>
                  <img src="${url}" alt="QR de Pago" style="max-width: 300px; width: 100%; border-radius: 8px; border: 1px solid #d1d5db;" />
                </div>
                <p>También puedes ver tu pedido y el QR desde tu perfil:</p>
                <a href="${clientUrl}/checkout/pending?saleId=${sale.id}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Ver mi Pedido</a>
                <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">Una vez que realices el pago, nuestro equipo lo verificará y procesará tu pedido.</p>
                <p style="font-size: 12px; color: #9ca3af;">— ${storeName}</p>
              </div>
            `;

            await NotificationService.sendEmail(
              sale.user?.email || sale.customerEmail,
              `QR de Pago Disponible - Pedido #${sale.id}`,
              emailHtml
            );
          } catch (err) {
            console.error('[SaleController] Error sending QR notification email:', err);
          }
        });
      }

      // Notificar in-app a admins
      InAppNotificationService.emitAdminNotification(
        'QR_UPLOADED',
        'QR de Pago Subido',
        `Se ha subido el QR de pago para la orden #${id}.`,
        { saleId: id, action: 'view_details' }
      ).catch(err => console.error('Error emitting QR notification:', err));

      // Notificar in-app al cliente (Solo si está registrado)
      if (sale.userId) {
        InAppNotificationService.createNotification(
          sale.userId,
          'QR_READY',
          '¡Tu QR de pago está listo!',
          `El código QR para tu pedido #${id} ya está disponible. Escanéalo con tu app bancaria para pagar.`,
          { saleId: id, url: `/checkout/pending?saleId=${id}` }
        ).catch(err => console.error('Error creating client QR notification:', err));
      }

      res.status(200).json({
        success: true,
        message: 'Imagen QR subida con éxito',
        data: { url }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin/Employee elimina imagen QR de una venta.
   * Solo permitido si paymentStatus !== 'PAID'.
   */
  async deleteQrImage(req, res, next) {
    try {
      const { id } = req.params;

      const sale = await prisma.sale.findUnique({
        where: { id: parseInt(id) }
      });

      if (!sale) {
        return res.status(404).json({ success: false, message: 'Venta no encontrada' });
      }

      if (sale.paymentStatus === 'PAID') {
        return res.status(400).json({ success: false, message: 'No se puede eliminar el QR de una venta ya pagada' });
      }

      await prisma.sale.update({
        where: { id: parseInt(id) },
        data: { qrPaymentUrl: null }
      });

      res.json({ success: true, message: 'Imagen QR eliminada con éxito' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SaleController();

