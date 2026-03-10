const prisma = require('../config/prisma');

class AuditService {
  
  /**
   * Registra una acción administrativa en el log de auditoría.
   * @param {Object} params
   * @param {number} params.adminId - ID del usuario admin que realiza la acción
   * @param {string} params.action - name de la acción (ej: 'UPDATE_PRODUCT', 'BAN_USER')
   * @param {string} params.entityType - Tipo de entidad afectada ('PRODUCT', 'USER', 'SALE')
   * @param {number} [params.branchId] - ID de la sucursal donde ocurre la acción
   * @param {Object} [params.changes] - JSON con los cambios (oldValue, newValue)
   * @param {string} [params.ip] - IP del cliente
   * @param {string} [params.userAgent] - User Agent del cliente
   */
  async logAction({ adminId, action, entityType, entityId, branchId, changes, ip, userAgent }) {
    try {
      await prisma.auditLog.create({
        data: {
          admin: adminId ? { connect: { id: parseInt(adminId) } } : undefined,
          branch: branchId ? { connect: { id: parseInt(branchId) } } : undefined,
          action,
          entityType,
          entityId: String(entityId),
          changes: changes || undefined,
          ip,
          userAgent
        }
      });
    } catch (error) {
      console.error(' [AUDIT ERROR] Failed to log action:', error);
   
    }
  }

  async getLogs(filters = {}) {
      const { search, entityType, adminId, branchId, startDate, endDate, page = 1, limit = 20 } = filters;
      
      const p = parseInt(page);
      const l = parseInt(limit);
      const skip = (p - 1) * l;

      const where = {};
      
      if (branchId) {
          if (Array.isArray(branchId)) {
              where.branchId = { in: branchId.map(id => parseInt(id)) };
          } else {
              where.branchId = parseInt(branchId);
          }
      }
      if (search) {
          where.OR = [
              { action: { contains: search, mode: 'insensitive' } },
              { entityId: { contains: search, mode: 'insensitive' } }
          ];
      }
      
      if (entityType && entityType !== 'ALL' && entityType !== '') {
          where.entityType = entityType;
      }
      
      if (adminId) {
          where.adminId = parseInt(adminId);
      }
      
      if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) where.createdAt.gte = new Date(startDate);
          if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [logs, totalCount] = await Promise.all([
          prisma.auditLog.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              include: { admin: { select: { name: true, email: true } } },
              skip,
              take: l
          }),
          prisma.auditLog.count({ where })
      ]);
      
      return {
          logs,
          totalCount,
          totalPages: Math.ceil(totalCount / l),
          currentPage: p
      };
  }
}

module.exports = new AuditService();
