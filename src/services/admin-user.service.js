const prisma = require('../config/prisma');
const AuditService = require('./audit.service');

class AdminUserService {

  async verifyIdentity(adminId, userId, ip) {
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) throw new Error('Usuario no encontrado');

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { dniVerified: true }
    });

    await AuditService.logAction({
      adminId,
      action: 'VERIFY_IDENTITY',
      entityType: 'USER',
      entityId: userId,
      branchId: user.branchId, 
      changes: { prev: user.dniVerified, new: true },
      ip
    });

    return updatedUser;
  }

  async toggleUserStatus(adminId, userId, status, ip) {
      
      const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
      if (!user) throw new Error('Usuario no encontrado');

      const updatedUser = await prisma.user.update({
          where: { id: parseInt(userId) },
          data: { status }
      });

      // Si se suspende, revocar tokens
      if (status === 'SUSPENDED') {
          await prisma.refreshToken.deleteMany({
              where: { userId: parseInt(userId) }
          });
      }

      await AuditService.logAction({
          adminId,
          action: 'CHANGE_STATUS',
          entityType: 'USER',
          entityId: userId,
          branchId: user.branchId, 
          changes: { prev: user.status, new: status },
          ip
      });

      return updatedUser;
  }

  async adjustPoints(adminId, userId, amount, reason, ip) {
      const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
      if (!user) throw new Error('Usuario no encontrado');

      const newTotal = Number(user.points) + amount;
      if (newTotal < 0) throw new Error('El usuario no puede tener puntos negativos');

      // Transacción para historial y update
      const result = await prisma.$transaction(async (tx) => {
          const updatedUser = await tx.user.update({
              where: { id: parseInt(userId) },
              data: { points: { increment: amount } }
          });

          await tx.pointsHistory.create({
              data: {
                  userId: parseInt(userId),
                  type: amount > 0 ? 'EARNED' : 'USED',
                  amount: Math.abs(amount),
                  reason: `Ajuste Admin: ${reason}`
              }
          });

          return updatedUser;
      });

      await AuditService.logAction({
          adminId,
          action: 'ADJUST_POINTS',
          entityType: 'USER',
          entityId: userId,
          branchId: user.branchId,
          changes: { prev: user.points, change: amount, reason },
          ip
      });

      return result;
  }
}

module.exports = new AdminUserService();
