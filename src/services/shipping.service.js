const prisma = require("../config/prisma");

class ShippingService {
  /**
   * Calcula el costo de envío basado en la dirección.
   * Soporta objeto { city, province, country } o string simple.
   */
  async calculateShippingCost(
    addressData,
    deliveryType,
    currencyCode,
    subtotal,
  ) {
    const EventService = require("./event.service");
    const activeEvent = await EventService.getActiveEvent();

    // 1. Prioridad Máxima: Evento con Envío Gratis
    if (
      activeEvent &&
      activeEvent.shippingEnabled &&
      activeEvent.shippingConfig
    ) {
      if (activeEvent.shippingConfig.type === "FREE") return 0;
    }

    if (deliveryType === "LOCAL") return 0;

    // Verificar envío gratuito por umbral
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    if (subtotal !== undefined && config?.freeShippingThreshold) {
      const thresholdBase = Number(config.freeShippingThreshold);
      let exchangeRate = 1;

      if (currencyCode) {
        const baseCurrencyCode = config?.baseCurrency;
        if (!baseCurrencyCode)
          throw new Error("Base currency not configured in StoreConfig");
        if (!baseCurrencyCode)
          throw new Error("Base currency not configured in StoreConfig");
        if (currencyCode !== baseCurrencyCode) {
          const currency = await prisma.currency.findUnique({
            where: { code: currencyCode },
          });
          if (currency && currency.isActive) {
            exchangeRate = parseFloat(currency.exchangeRateToBase.toString());
          }
        }
      }

      const thresholdConverted = thresholdBase * exchangeRate;
      if (thresholdConverted > 0 && subtotal >= thresholdConverted) {
        return 0;
      }
    }

    // Normalizar entrada
    let city = null;
    let province = null;
    let country = null;
    let addressString = "";

    if (typeof addressData === "object" && addressData !== null) {
      city = addressData.city?.trim();
      province = addressData.state?.trim() || addressData.province?.trim();
      country = addressData.country?.trim();
      addressString = [city, province, country]
        .filter(Boolean)
        .join(", ")
        .toLowerCase();
    } else if (addressData) {
      addressString = String(addressData).toLowerCase();
    }

    if (!addressString && !city && !province) {
      const defaultCost = await this.getDefaultCost();
      return defaultCost;
    }

    // Obtener zonas activas
    const defaultCost = await this.getDefaultCost();
    const zones = await prisma.shippingZone.findMany({
      where: { active: true },
    });

    // Prioridad 1: Coincidencia exacta de Ciudad (si se provee ciudad)
    let zoneMatch = null;
    if (city) {
      zoneMatch = zones.find(
        (z) => z.city && z.city.toLowerCase() === city.toLowerCase(),
      );
    }

    // Prioridad 2: Coincidencia exacta de Provincia (si se provee provincia)
    if (!zoneMatch && province) {
      zoneMatch = zones.find(
        (z) =>
          z.province &&
          z.province.toLowerCase() === province.toLowerCase() &&
          !z.city,
      );
    }

    // Prioridad 3: Coincidencia de cadena (Fallback para string de dirección)
    // Ordenar zonas por especificidad (Ciudad > Provincia > País) para coincidir primero con la más específica
    const sortedZones = zones.sort((a, b) => {
      const scoreA =
        (a.city ? 3 : 0) + (a.province ? 2 : 0) + (a.country ? 1 : 0);
      const scoreB =
        (b.city ? 3 : 0) + (b.province ? 2 : 0) + (b.country ? 1 : 0);
      return scoreB - scoreA;
    });

    const stringMatch = sortedZones.find((z) => {
      if (z.city && addressString.includes(z.city.toLowerCase())) return true;
      if (z.province && addressString.includes(z.province.toLowerCase()))
        return true;
      if (z.country && addressString.includes(z.country.toLowerCase()))
        return true;
      return false;
    });

    let cost = defaultCost;

    if (zoneMatch) {
      cost = parseFloat(zoneMatch.cost);
    } else if (stringMatch) {
      cost = parseFloat(stringMatch.cost);
    }

    // Convertir moneda si es necesario
    if (currencyCode) {
      try {
        const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
        const baseCurrency = config?.baseCurrency;
        if (!baseCurrency)
          throw new Error("Base currency not configured in StoreConfig");

        if (currencyCode !== baseCurrency) {
          const currency = await prisma.currency.findUnique({
            where: { code: currencyCode },
          });
          if (currency && currency.isActive) {
            cost = cost * parseFloat(currency.exchangeRateToBase.toString());
          }
        }
      } catch (e) {
        console.error("Error converting shipping currency", e);
      }
    }

    if (
      activeEvent &&
      activeEvent.shippingEnabled &&
      activeEvent.shippingConfig?.type === "DISCOUNT"
    ) {
      const discountPercent = parseFloat(activeEvent.shippingConfig.value) || 0;
      cost = cost * (1 - discountPercent / 100);
    }

    return cost;
  }

  async getDefaultCost() {
    const defaultZone = await prisma.shippingZone.findFirst({
      where: {
        active: true,
        city: null,
        province: null,
        country: null,
      },
    });
    return defaultZone ? parseFloat(defaultZone.cost) : 1000;
  }

  // --- CRUD ---

  async getAllZones(filters = {}) {
    const { search, page = 1, limit = 10 } = filters;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { city: { contains: search, mode: "insensitive" } },
        { province: { contains: search, mode: "insensitive" } },
        { country: { contains: search, mode: "insensitive" } },
      ];
    }

    const [zones, total] = await Promise.all([
      prisma.shippingZone.findMany({
        where,
        orderBy: [{ country: "asc" }, { province: "asc" }, { city: "asc" }],
        skip,
        take,
      }),
      prisma.shippingZone.count({ where }),
    ]);

    return {
      data: zones,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createZone(data) {
    // Validar duplicados
    // Tratar strings vacíos como null para consistencia
    const city = data.city ? data.city.trim() : null;
    const province = data.province ? data.province.trim() : null;
    const country = data.country ? data.country.trim() : null;

    const existing = await prisma.shippingZone.findFirst({
      where: {
        city: city === null ? null : { equals: city, mode: "insensitive" },
        province:
          province === null ? null : { equals: province, mode: "insensitive" },
        country:
          country === null ? null : { equals: country, mode: "insensitive" },
      },
    });

    if (existing) {
      throw new Error(
        `Ya existe una zona de envío para ${city || province || country || "General"}`,
      );
    }

    return await prisma.shippingZone.create({
      data: {
        city,
        province,
        country,
        cost: data.cost,
        active: data.active !== undefined ? data.active : true,
      },
    });
  }

  async updateZone(id, data) {
    const city = data.city ? data.city.trim() : null;
    const province = data.province ? data.province.trim() : null;
    const country = data.country ? data.country.trim() : null;

    // Verificar si la NUEVA combinación existe en otro lado (excluyendo la misma)
    const combinationExists = await prisma.shippingZone.findFirst({
      where: {
        city: city === null ? null : { equals: city, mode: "insensitive" },
        province:
          province === null ? null : { equals: province, mode: "insensitive" },
        country:
          country === null ? null : { equals: country, mode: "insensitive" },
        id: { not: parseInt(id) },
      },
    });

    if (combinationExists) {
     
      throw new Error(
        `Ya existe una zona de envío para ${city || province || country || "General"}`,
      );
    }

    return await prisma.shippingZone.update({
      where: { id: parseInt(id) },
      data: {
        city,
        province,
        country,
        cost: data.cost,
        active: data.active,
      },
    });
  }

  async deleteZone(id) {
    return await prisma.shippingZone.delete({
      where: { id: parseInt(id) },
    });
  }
}

module.exports = new ShippingService();
