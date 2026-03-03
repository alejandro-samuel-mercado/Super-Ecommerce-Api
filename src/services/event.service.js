const prisma = require('../config/prisma');

class EventService {

  /**
   * Obtiene el evento activo actual (si existe).
   * Prioridad: Si hay múltiples, toma el que termina antes (más urgente) o el más reciente.
   * Asumiremos por reglas del negocio que idealmente no deberían solaparse, pero si pasa, tomamos el primero encontrado.
   */
  async getActiveEvent() {
    const now = new Date();
     // Buscar evento que esté activo flag=true y fechas vigentes
    const event = await prisma.event.findFirst({
      where: {
        active: true,
        startDate: { lte: now },
        endDate: { gte: now }
      },
      orderBy: {
        startDate: 'desc'
      },
      include: {
        discounts: {
          where: { active: true },
          orderBy: { priority: 'desc' }
        }
      }
    });
    
    return event;
  }

  /**
   * Crea un nuevo evento con configuración completa
   */
  async createEvent(data) {
     const { 
       name, startDate, endDate, 
       shippingConfig, shippingEnabled, couponsEnabled, paymentMethods, 
       deliveryMethods, pointsEnabled, taxesEnabled, bannerMessages,
       heroBanners, marqueeText, secondaryAds
     } = data;

     // REGLA DE EVENTO ÚNICO ACTIVO
     // Si estamos creando un evento activo, desactivamos los demás
     if (data.active) {
         await prisma.event.updateMany({
             where: { active: true },
             data: { active: false }
         });
     }

     return await prisma.event.create({
       data: {
         name,
         startDate: new Date(startDate),
         endDate: new Date(endDate),
         active: data.active ?? true,
         shippingConfig: shippingConfig || null,
         shippingEnabled: shippingEnabled ?? true,
         couponsEnabled: couponsEnabled ?? false,
         paymentMethods: paymentMethods || [],
         deliveryMethods: deliveryMethods || [],
         pointsEnabled: pointsEnabled ?? false,
         taxesEnabled: taxesEnabled ?? true,
         bannerMessages: bannerMessages || { top: '', middle: '', bottom: '' },
         heroBanners: heroBanners || null,
         marqueeText: marqueeText || null,
         secondaryAds: secondaryAds || null
       }
     });
  }

  async updateEvent(id, data) {
    const { 
       name, startDate, endDate, active,
       shippingConfig, shippingEnabled, couponsEnabled, paymentMethods, 
       deliveryMethods, pointsEnabled, taxesEnabled, bannerMessages,
       heroBanners, marqueeText, secondaryAds
     } = data;

     if (active) {
         await prisma.event.updateMany({
             where: { 
                 active: true,
                 id: { not: parseInt(id) }
             },
             data: { active: false }
         });
     }

     return await prisma.event.update({
       where: { id: parseInt(id) },
       data: {
         name,
         startDate: startDate ? new Date(startDate) : undefined,
         endDate: endDate ? new Date(endDate) : undefined,
         active,
         shippingConfig,
         shippingEnabled,
         couponsEnabled,
         paymentMethods,
         deliveryMethods,
         pointsEnabled,
         taxesEnabled,
         bannerMessages,
         heroBanners,
         marqueeText,
         secondaryAds
       }
     });
  }

  async getAllEvents() {
    return await prisma.event.findMany({
      include: { discounts: true },
      orderBy: { startDate: 'desc' }
    });
  }

  async deleteEvent(id) {
    return await prisma.event.delete({ where: { id: parseInt(id) } });
  }
}

module.exports = new EventService();
