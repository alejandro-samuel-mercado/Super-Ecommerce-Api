const prisma = require('../config/prisma');

/**
 * Servicio de Limpieza de Stock
 * Maneja la limpieza de reservas de stock expiradas
 * Libera stock que fue reservado para pagos pendientes que expiraron
 */
class StockCleanupService {
  
  /**
   * Limpiar reservas de stock expiradas
   * Llamado periódicamente por cron job
   * @returns {Promise<number>} Número de reservas limpiadas
   */
  async cleanupExpiredReservations() {
    try {
      
      // Buscar todas las reservas expiradas (Límite 100 por ciclo para evitar sobrecarga)
      let expired = [];
      try {
        expired = await prisma.stockReservation.findMany({
          where: {
            expiresAt: { lt: new Date() },
            released: false
          },
          take: 100,
          include: {
            sale: true,
            sku: { include: { product: true } }
          }
        });
      } catch (err) {
        console.warn('[StockCleanup] Advertencia: Falló al obtener reservas expiradas. Saltando ciclo.', err.message);
        return 0;
      }
      
      if (expired.length === 0) {
        return 0;
      }
      
      const AuditService = require('./audit.service');
      let cleaned = 0;
      
      // Procesar cada reserva expirada
      for (const reservation of expired) {
        try {
          await prisma.$transaction(async (tx) => {
            // Verificar estado actual
            const current = await tx.stockReservation.findUnique({
              where: { id: reservation.id }
            });
            
            if (!current || current.released) return;
            
            // Marcar reserva como liberada
            await tx.stockReservation.update({
              where: { id: reservation.id },
              data: { released: true }
            });
            
            // Verificar si la venta sigue pendiente
            const sale = await tx.sale.findUnique({
              where: { id: reservation.saleId }
            });
            
            if (sale && sale.paymentStatus === 'PENDING') {
              const oldStatus = sale.paymentStatus;
              const newStatus = 'CANCELLED';

              // Cancelar la venta
              await tx.sale.update({
                where: { id: reservation.saleId },
                data: { 
                  paymentStatus: newStatus,
                  observations: `Cancelado automáticamente (SYSTEM) - Tiempo expirado (${new Date().toISOString()})`
                }
              });

              if (sale.pointsUsed > 0) {
                  await tx.user.update({
                      where: { id: sale.userId },
                      data: { points: { increment: sale.pointsUsed } }
                  });
                  await tx.pointsHistory.create({
                      data: {
                          userId: sale.userId,
                          type: 'EARNED',
                          amount: sale.pointsUsed,
                          reason: `Reembolso por expiración de reserva - Venta #${sale.id}`
                      }
                  });
              }

              await AuditService.logAction({
                  adminId: null,
                  action: 'AUTO_CANCEL_EXPIRED_SALE',
                  entityType: 'SALE',
                  entityId: sale.id,
                  changes: {
                      paymentStatus: { old: oldStatus, new: newStatus },
                      reason: 'Expiration of stock reservation'
                  }
              });
            }
            
            cleaned++;
          });
        } catch (error) {
          console.error(`[StockCleanup] ❌ Error limpiando reserva ${reservation.id}:`, error.message);
        }
      }
      
      return cleaned;
      
    } catch (error) {
      console.error('[StockCleanup] Error fatal durante limpieza:', error);
      throw error;
    }
  }
  
  /**
   * Obtener estadísticas de reservas de stock
   * Útil para monitoreo
   * @returns {Promise<object>}
   */
  async getReservationStats() {
    const stats = await prisma.stockReservation.groupBy({
      by: ['released'],
      _count: { id: true },
      _sum: { quantity: true }
    });
    
    const expired = await prisma.stockReservation.count({
      where: {
        expiresAt: { lt: new Date() },
        released: false
      }
    });
    
    return {
      active: stats.find(s => !s.released)?._count.id || 0,
      released: stats.find(s => s.released)?._count.id || 0,
      expiredPending: expired,
      totalQuantityReserved: stats.find(s => !s.released)?._sum.quantity || 0
    };
  }
  
  /**
   * Forzar liberación de una reserva específica (acción de admin)
   * @param {string} reservationId
   */
  async forceReleaseReservation(reservationId) {
    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.stockReservation.findUnique({
        where: { id: reservationId },
        include: { sale: true }
      });
      
      if (!reservation) {
        throw new Error(`Reserva ${reservationId} no encontrada`);
      }
      
      if (reservation.released) {
        return { message: 'Reserva ya liberada' };
      }
      
      await tx.stockReservation.update({
        where: { id: reservationId },
        data: { released: true }
      });
      
      
      return { 
        message: 'Reserva liberada exitosamente',
        reservation: reservation
      };
    });
  }
}

module.exports = new StockCleanupService();
