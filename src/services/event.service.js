const prisma = require('../config/prisma');

class EventService {

  async getActiveEvent() {
    const now = new Date();
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

  async createEvent(data) {
    const {
      name, startDate, endDate,
      shippingConfig, shippingEnabled, couponsEnabled, paymentMethods,
      deliveryMethods, pointsEnabled, taxesEnabled, bannerMessages,
      heroBanners, marqueeText, secondaryAds
    } = data;

    return await prisma.$transaction(async (tx) => {
      if (data.active) {
        await tx.event.updateMany({
          where: { active: true },
          data: { active: false }
        });
      }

      return await tx.event.create({
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
    });
  }

  async updateEvent(id, data) {
    const {
      name, startDate, endDate, active,
      shippingConfig, shippingEnabled, couponsEnabled, paymentMethods,
      deliveryMethods, pointsEnabled, taxesEnabled, bannerMessages,
      heroBanners, marqueeText, secondaryAds
    } = data;

    return await prisma.$transaction(async (tx) => {
      if (active) {
        await tx.event.updateMany({
          where: {
            active: true,
            id: { not: parseInt(id) }
          },
          data: { active: false }
        });
      }

      return await tx.event.update({
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
