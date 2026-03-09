const AdminUserService = require('../services/admin-user.service');
const AdminProductService = require('../services/admin-product.service');
const AdminSaleService = require('../services/admin-sale.service');
const AuditService = require('../services/audit.service');
const prisma = require('../config/prisma');

class AdminController {

  async getStats(req, res, next) {
      try {
          let { timeRange, branchId } = req.query;
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

          const stats = await AdminSaleService.getDashboardStats(timeRange, branchId ? parseInt(branchId) : null, branchIds);
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
          let { branchId } = req.query;
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
              }
          }

          const result = await AuditService.getLogs({ ...req.query, branchId: branchId ? parseInt(branchId) : undefined });
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
