const prisma = require('../config/prisma');

class InAppNotificationService {
  
  /**
   * Crear una nueva notificación para un usuario
   */
  async createNotification(userId, type, title, message, data = null) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: data ? data : undefined,
          read: false
        }
      });
      return notification;
    } catch (error) {
      console.error('❌ [NotificationService] Error creating notification:', error);
      return null;
    }
  }

  /**
   * Obtener notificaciones para un usuario
   * Dispara verificaciones inteligentes de stock y promos en background
   */
  async getNotifications(userId, limit = 20) {
    // 1. Obtener existentes no leídas/recientes
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    // 2. Disparar verificaciones inteligentes (fire and forget o await si es crítico)
    // Esperamos aquí para asegurar datos frescos al usuario
    await this.checkStockAlerts(userId);
  

    return notifications;
  }

  /**
   * Verificar problemas de stock en favoritos del usuario o potencialmente carrito
   * Por ahora, verifiquemos Favoritos como "Lista de Seguimiento"
   */
  async checkStockAlerts(userId) {
    try {
       // Obtener favoritos del usuario
       const favorites = await prisma.user.findUnique({
         where: { id: userId },
         select: {
            favorites: {
                include: {
                    skus: true
                }
            }
         }
       });

       if (!favorites || !favorites.favorites) return;

       for (const product of favorites.favorites) {
           // Verificar stock total del producto (suma de skus)
           const totalStock = product.skus.reduce((acc, sku) => acc + sku.stock, 0);
           
           if (totalStock === 0) {
               // Alerta de stock agotado
               await this._createUniqueSystemNotification(
                   userId,
                   'STOCK',
                   `¡${product.name} está agotado!`,
                   `El producto que te gusta se ha quedado sin stock. Te avisaremos cuando vuelva.`
               );
           } else if (totalStock < 3) {
               // Alerta de stock bajo
               await this._createUniqueSystemNotification(
                   userId,
                   'STOCK',
                   `¡Últimas unidades de ${product.name}!`,
                   `Solo quedan ${totalStock} unidades. ¡Aprovecha antes de que se agoten!`,
                   { url: `/products/${product.id}` }
               );
           }
       }
    } catch (error) {
        console.error('❌ [NotificationService] Error checking stock alerts:', error);
    }
  }

  /**
   * Helper para evitar spam de la misma notificación
   */
  async _createUniqueSystemNotification(userId, type, title, message, data) {
      // Verificar si existe notificación similar 
      const existing = await prisma.notification.findFirst({
          where: {
              userId,
              type,
              title,
              createdAt: {
                  gte: new Date(new Date().setHours(0,0,0,0))
              }
          }
      });

      if (!existing) {
          await this.createNotification(userId, type, title, message, data);
      }
  }

  async markAsRead(userId, notificationId) {
      if (notificationId === 'all') {
          await prisma.notification.updateMany({
              where: { userId, read: false },
              data: { read: true }
          });
      }
  }

  async deleteNotification(userId, notificationId) {
      await prisma.notification.deleteMany({
          where: {
              id: parseInt(notificationId),
              userId: userId
          }
      });
  }

  /**
   * Emitir una notificación en tiempo real a todos los administradores conectados
   */
  async emitAdminNotification(type, title, message, data = {}) {
    try {
      const io = require('../socket').getIo();
      if (io) {
        io.to('admins').emit('admin_notification', {
          id: `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type,
          title,
          message,
          data,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('❌ [NotificationService] Error emitting admin socket notification:', error);
    }
  }
}

module.exports = new InAppNotificationService();
