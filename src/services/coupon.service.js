const prisma = require("../config/prisma");

class CouponService {
  async create(data) {
    if (data.type === "PERCENTAGE") {
      if (parseFloat(data.value) <= 0 || parseFloat(data.value) > 100) {
        throw new Error(
          "El valor del cupón porcentual debe estar entre 0 y 100.",
        );
      }
    }

    const existing = await prisma.coupon.findUnique({
      where: { code: data.code },
    });
    if (existing) throw new Error("Coupon code already exists");

    return await prisma.coupon.create({
      data: {
        code: data.code,
        type: data.type,
        value: data.value,
        active: data.active,
        maxUses: data.maxUses,
        maxUsesPerUser: data.maxUsesPerUser,
        maxDiscount: data.maxDiscount,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        minPurchase: data.minPurchase,
      },
    });
  }

  async getAllCoupons(params = {}) {
    const { page = 1, limit = 20, search } = params;
    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, parseInt(limit));
    const skip = (p - 1) * l;

    const where = {};
    if (search) {
        where.code = { contains: search.trim(), mode: 'insensitive' };
    }

    const coupons = await prisma.coupon.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: l
    });
    
    const total = await prisma.coupon.count({ where });

    return { data: coupons, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  async validateCoupon(code, purchaseAmount, currencyCode, userId) {
    if (!code) return null;

    const EventService = require("./event.service");
    const activeEvent = await EventService.getActiveEvent();
    if (activeEvent && activeEvent.couponsEnabled === false) {
      throw new Error(
        `Los cupones están deshabilitados durante el evento: ${activeEvent.name}`,
      );
    }

    const coupon = await prisma.coupon.findFirst({
      where: {
        code: { equals: code, mode: "insensitive" },
      },
    });

    if (!coupon) throw new Error("El código de cupón no existe");
    if (!coupon.active) throw new Error("El cupón está inactivo");

    const now = new Date();
    if (coupon.validUntil && now > coupon.validUntil)
      throw new Error("El cupón ha expirado");
    if (now < coupon.validFrom) throw new Error("El cupón aún no es válido");

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
      throw new Error("Límite de uso del cupón alcanzado");

    if (coupon.maxUsesPerUser && userId) {
      const userUsageCount = await prisma.sale.count({
        where: {
          userId: parseInt(userId),
          couponId: coupon.id,
          paymentStatus: { in: ["PAID", "PENDING"] },
        },
      });
      if (userUsageCount >= coupon.maxUsesPerUser) {
        throw new Error("Has alcanzado el límite de uso para este cupón");
      }
    }

    // Conversion de multi moneda para limites
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrencyCode = config?.baseCurrency;
    if (!baseCurrencyCode)
      throw new Error("Base currency not configured in StoreConfig");

    let rate = 1;
    if (currencyCode && currencyCode !== baseCurrencyCode) {
      const currency = await prisma.currency.findUnique({
        where: { code: currencyCode },
      });
      if (currency && currency.isActive) {
        rate = parseFloat(currency.exchangeRateToBase.toString());
      }
    }

    const minPurchaseValue = coupon.minPurchase
      ? parseFloat(coupon.minPurchase.toString())
      : 0;
    const minPurchaseConverted = minPurchaseValue * rate;

    if (minPurchaseConverted > 0 && purchaseAmount < minPurchaseConverted) {
      throw new Error(
        `La compra mínima para este cupón es ${currencyCode || baseCurrencyCode} ${minPurchaseConverted.toFixed(2)}`,
      );
    }

    // Calcular descuento
    let discount = 0;
    const couponValue = parseFloat(coupon.value.toString());
    if (coupon.type === "PERCENTAGE") {
      discount = purchaseAmount * (couponValue / 100);
    } else {
      discount = couponValue * rate;
    }

    const maxDiscountValue = coupon.maxDiscount
      ? parseFloat(coupon.maxDiscount.toString())
      : 0;
    if (maxDiscountValue > 0) {
      const maxDiscountConverted = maxDiscountValue * rate;
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
      discountAmount: discount,
    };
  }

  async update(id, data) {
    if (data.type === "PERCENTAGE") {
      if (
        data.value !== undefined &&
        (parseFloat(data.value) <= 0 || parseFloat(data.value) > 100)
      ) {
        throw new Error(
          "El valor del cupón porcentual debe estar entre 0 y 100.",
        );
      }
    }
    if (data.code) {
      const existing = await prisma.coupon.findFirst({
        where: {
          code: data.code,
          id: { not: parseInt(id) },
        },
      });
      if (existing) throw new Error("El código de cupón ya existe");
    }

    return await prisma.coupon.update({
      where: { id: parseInt(id) },
      data: {
        code: data.code,
        type: data.type,
        value: data.value,
        active: data.active,
        maxUses: data.maxUses,
        maxUsesPerUser: data.maxUsesPerUser,
        maxDiscount: data.maxDiscount,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        minPurchase: data.minPurchase,
      },
    });
  }

  async delete(id) {
    return await prisma.coupon.delete({
      where: { id: parseInt(id) },
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
      const coupon = await client.coupon.findUnique({
        where: { id: parseInt(id) },
      });
      if (!coupon) throw new Error("Cupón no encontrado al incrementar");
      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
        throw new Error(
          `El cupón "${coupon.code}" ya alcanzó su límite de uso. Por favor, retíralo e intenta de nuevo sin él.`,
        );
      }
    }
  }
}

module.exports = new CouponService();
