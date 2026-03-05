const prisma = require('../config/prisma');

class CouponService {

  async create(data) {
    if (data.type === 'PERCENTAGE' && !data.maxDiscount) {
        throw new Error('Los cupones porcentuales deben tener un tope máximo de reintegro (maxDiscount)');
    }
    
    const existing = await prisma.coupon.findUnique({ where: { code: data.code } });
    if (existing) throw new Error('Coupon code already exists');

    return await prisma.coupon.create({ data });
  }

  async getAllCoupons() {
      return await prisma.coupon.findMany({
          orderBy: { createdAt: 'desc' }
      });
  }

  async validateCoupon(code, purchaseAmount, currencyCode) {
      if (!code) return null;
      
      // VERIFICACIÓN DE EVENTO
      const EventService = require('./event.service');
      const activeEvent = await EventService.getActiveEvent();
      if (activeEvent && activeEvent.couponsEnabled === false) {
          throw new Error(`Los cupones están deshabilitados durante el evento: ${activeEvent.name}`);
      }

      const coupon = await prisma.coupon.findUnique({ where: { code } });
      
      if (!coupon) throw new Error('Cupón inválido');
      if (!coupon.active) throw new Error('El cupón está inactivo');
      
      const now = new Date();
      if (coupon.validUntil && now > coupon.validUntil) throw new Error('El cupón ha expirado');
      if (now < coupon.validFrom) throw new Error('El cupón aún no es válido');

      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new Error('Límite de uso del cupón alcanzado');

      // Conversion de multi moneda para limites
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const baseCurrencyCode = config?.baseCurrency || 'USD';

      let rate = 1; 
      if (currencyCode && currencyCode !== baseCurrencyCode) {
          const currency = await prisma.currency.findUnique({ where: { code: currencyCode } });
          if (currency && currency.isActive) {
              rate = parseFloat(currency.exchangeRateToBase.toString());
          }
      }

      const minPurchaseConverted = coupon.minPurchase ? parseFloat(coupon.minPurchase) * rate : 0;

      if (minPurchaseConverted > 0 && purchaseAmount < minPurchaseConverted) {
          throw new Error(`La compra mínima para este cupón es ${currencyCode || baseCurrencyCode} ${minPurchaseConverted.toFixed(2)}`);
      }

      // Calcular descuento
      let discount = 0;
      if (coupon.type === 'PERCENTAGE') {
          discount = purchaseAmount * (parseFloat(coupon.value) / 100);
      } else {
          discount = parseFloat(coupon.value) * rate;
      }

      if (coupon.maxDiscount) {
          const maxDiscountConverted = parseFloat(coupon.maxDiscount) * rate;
          if (discount > maxDiscountConverted) {
              discount = maxDiscountConverted;
          }
      }

      if (discount > purchaseAmount) discount = purchaseAmount;

      return {
          id: coupon.id,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          discountAmount: discount
      };
  }

  async update(id, data) {
      if (data.type === 'PERCENTAGE' && !data.maxDiscount) {
          throw new Error('Los cupones porcentuales deben tener un tope máximo de reintegro (maxDiscount)');
      }
      if (data.code) {
          const existing = await prisma.coupon.findFirst({
              where: { 
                  code: data.code,
                  id: { not: parseInt(id) }
              } 
          });
          if (existing) throw new Error('El código de cupón ya existe');
      }

      return await prisma.coupon.update({
          where: { id: parseInt(id) },
          data: {
              code: data.code,
              type: data.type,
              value: data.value,
              active: data.active,
              maxUses: data.maxUses,
              maxDiscount: data.maxDiscount,
              validFrom: data.validFrom,
              validUntil: data.validUntil,
              minPurchase: data.minPurchase
          }
      });
  }

  async delete(id) {
      return await prisma.coupon.delete({
          where: { id: parseInt(id) }
      });
  }

  async incrementCouponUsage(id, tx) {
      const client = tx || prisma;

      // Verificación e incremento atómico usando SQL Crudo para correctitud en comparación de columnas
      // Retorna número de filas afectadas
      const result = await client.$executeRaw`
          UPDATE "Coupon"
          SET "usedCount" = "usedCount" + 1
          WHERE id = ${parseInt(id)}
          AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
      `;

      if (result === 0) {
          // Verificar si falló porque no existe o porque se alcanzó el límite
          const coupon = await client.coupon.findUnique({ where: { id: parseInt(id) } });
          if (!coupon) throw new Error('Cupón no encontrado al incrementar');
           if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
               throw new Error(`El cupón "${coupon.code}" ya alcanzó su límite de uso. Por favor, retíralo e intenta de nuevo sin él.`);
           }
      }
  }
}

module.exports = new CouponService();
