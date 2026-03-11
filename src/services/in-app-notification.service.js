const prisma = require('../config/prisma');

class InAppNotificationService {
  
  /**
   * Crear una nueva notificación para un usuario
   */
  async createNotification(userId, type, title, message, data = null, branchId = null) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          branchId: branchId || null,
          type,
          title,
          message,
          data: data ? data : undefined,
          read: false
        }
      });
      return notification;
    } catch (error) {
     
      return null;
    }
  }

  /**
   * Obtener notificaciones para un usuario
   * Dispara verificaciones inteligentes de stock y promos en background
   */
  async getNotifications(userId, limit = 20, branchId = null) {
    const where = { userId };
    if (branchId) {
        where.branchId = parseInt(branchId);
    }

    // 1. Obtener existentes no leídas/recientes
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    this.checkStockAlerts(userId, branchId).catch(() => {});

    return notifications;
  }

  /**
   * Verificar problemas de stock en favoritos del usuario o potencialmente carrito
   * Por ahora, verifiquemos Favoritos como "Lista de Seguimiento"
   */
  async checkStockAlerts(userId, branchId = null) {
    try {
       // 1. Obtener favoritos del usuario con inventarios
       const userWithFavorites = await prisma.user.findUnique({
         where: { id: userId },
         select: {
            favorites: {
                include: {
                    skus: {
                        include: {
                            branchInventory: branchId ? { where: { branchId: parseInt(branchId) } } : true
                        }
                    }
                }
            }
         }
       });

       if (!userWithFavorites || !userWithFavorites.favorites || userWithFavorites.favorites.length === 0) return;

       // 2. Optimización: Buscar todas las notificaciones de stock ya enviadas hoy para este usuario
       // Esto evita el problema N+1 de hacer una query por cada producto/sucursal
       const todayNotifications = await prisma.notification.findMany({
          where: {
              userId,
              type: 'STOCK',
              createdAt: {
                  gte: new Date(new Date().setHours(0,0,0,0))
              }
          }
       });

       // Mapa para búsqueda rápida: "title:branchId"
       const existingNotifsMap = new Set(
         todayNotifications.map(n => `${n.title}:${n.branchId}`)
       );

       for (const product of userWithFavorites.favorites) {
           const inventories = [];
           product.skus.forEach(sku => {
               if (sku.branchInventory) {
                   if (Array.isArray(sku.branchInventory)) {
                       inventories.push(...sku.branchInventory);
                   } else {
                       inventories.push(sku.branchInventory);
                   }
               }
           });

           // Agrupar por sucursal
           const stockByBranch = {};
           inventories.forEach(inv => {
               if (!stockByBranch[inv.branchId]) stockByBranch[inv.branchId] = 0;
               stockByBranch[inv.branchId] += Number(inv.stock || 0);
           });

           for (const [bid, totalStock] of Object.entries(stockByBranch)) {
               const bIdInt = parseInt(bid);
               // Si se filtró por branchId, solo procesar esa
               if (branchId && bIdInt !== parseInt(branchId)) continue;

               let title = '';
               let message = '';
               let data = null;

               if (totalStock <= 0) {
                   title = `¡${product.name} agotado!`;
                   message = `El producto en tus favoritos se quedó sin stock en esta sucursal.`;
               } else if (totalStock < 5) {
                   title = `¡Últimas unidades de ${product.name}!`;
                   message = `Solo quedan ${totalStock} unidades en esta sucursal. ¡Corre!`;
                   data = { url: `/products/${product.id}` };
               }

               if (title && !existingNotifsMap.has(`${title}:${bIdInt}`)) {
                   await this.createNotification(userId, 'STOCK', title, message, data, bIdInt);
               }
           }
       }
    } catch (error) {
       
    }
  }

  /**
   * Helper para evitar spam de la misma notificación por sucursal
   */
  async _createUniqueSystemNotification(userId, type, title, message, data, branchId = null) {
      // Verificar si existe notificación similar hoy para esta sucursal
      const existing = await prisma.notification.findFirst({
          where: {
              userId,
              type,
              title,
              branchId: branchId || null,
              createdAt: {
                  gte: new Date(new Date().setHours(0,0,0,0))
              }
          }
      });

      if (!existing) {
          await this.createNotification(userId, type, title, message, data, branchId);
      }
  }

  async markAsRead(userId, notificationId) {
      if (notificationId === 'all') {
          await prisma.notification.updateMany({
              where: { userId, read: false },
              data: { read: true }
          });
      } else {
          await prisma.notification.updateMany({
              where: { id: parseInt(notificationId), userId },
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
     
    }
  }

  async getAllAdminNotifications(params = {}) {
      const { page = 1, limit = 20, search, branchId } = params;
      const p = Math.max(1, parseInt(page));
      const l = Math.max(1, parseInt(limit));
      const skip = (p - 1) * l;
      const where = { userId: null };
      if (branchId) where.branchId = parseInt(branchId);
      if (search) {
          where.OR = [
              { title: { contains: search, mode: 'insensitive' } },
              { message: { contains: search, mode: 'insensitive' } }
          ];
      }
      const [notifications, total] = await Promise.all([
          prisma.notification.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              skip,
              take: l
          }),
          prisma.notification.count({ where })
      ]);
      return { data: notifications, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }
}

module.exports = new InAppNotificationService();
