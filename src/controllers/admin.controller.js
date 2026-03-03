const AdminUserService = require('../services/admin-user.service');
const AdminProductService = require('../services/admin-product.service');
const AdminSaleService = require('../services/admin-sale.service');
const AuditService = require('../services/audit.service');
const prisma = require('../config/prisma');

class AdminController {

  async getStats(req, res, next) {
      try {
          const { timeRange, branchId } = req.query;
          const stats = await AdminSaleService.getDashboardStats(timeRange, branchId ? parseInt(branchId) : null);
          res.json({
              success: true,
              data: stats
          });
      } catch (error) {
          next(error);
      }
  }

  async getAuditLogs(req, res, next) {
      try {
          console.log(' [AUDIT CONTROLLER] Query Params:', req.query);
          const result = await AuditService.getLogs(req.query);
          res.json({ success: true, data: result });
      } catch (error) {
          next(error);
      }
  }

  async verifyUser(req, res, next) {
      try {
          const { id } = req.params;
          const result = await AdminUserService.verifyIdentity(req.user.id, id, req.ip);
          res.json({ success: true, data: result });
      } catch (error) {
          next(error);
      }
  }

  async toggleUserStatus(req, res, next) {
      try {
          const { id } = req.params;
          const { status } = req.body;
          const result = await AdminUserService.toggleUserStatus(req.user.id, id, status, req.ip);
          res.json({ success: true, data: result });
      } catch (error) {
          next(error);
      }
  }

  async adjustPoints(req, res, next) {
      try {
          const { id } = req.params;
          const { amount, reason } = req.body;
          const result = await AdminUserService.adjustPoints(req.user.id, id, amount, reason, req.ip);
          res.json({ success: true, data: result });
      } catch (error) {
          next(error);
      }
  }
}

module.exports = new AdminController();
