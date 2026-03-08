const prisma = require("../config/prisma");

class CurrencyService {
  async getAllCurrencies(onlyActive = true) {
    return await prisma.currency.findMany({
      where: onlyActive ? { isActive: true } : {},
      orderBy: { code: "asc" },
    });
  }

  async getCurrencyByCode(code) {
    return await prisma.currency.findUnique({
      where: { code: code.toUpperCase() },
    });
  }

  async createCurrency(data) {
    return await prisma.currency.create({
      data: {
        code: data.code.toUpperCase(),
        symbol: data.symbol,
        exchangeRateToBase: parseFloat(data.exchangeRateToBase),
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  async updateCurrency(id, data) {
    const updateData = {};
    if (data.symbol) updateData.symbol = data.symbol;
    if (data.exchangeRateToBase !== undefined)
      updateData.exchangeRateToBase = parseFloat(data.exchangeRateToBase);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return await prisma.currency.update({
      where: { id: parseInt(id) },
      data: updateData,
    });
  }

  async deleteCurrency(id) {
    // No permitir borrar si es la moneda base de StoreConfig
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const currency = await prisma.currency.findUnique({
      where: { id: parseInt(id) },
    });

    if (currency && config && currency.code === config.baseCurrency) {
      throw new Error("Cannot delete the base currency");
    }

    return await prisma.currency.delete({
      where: { id: parseInt(id) },
    });
  }

  /**
   * Obtener el código de país del cliente basado en headers de IP (Vercel/CF)
   */
  getCountryByContext(req) {
    // 1. Prioridad: Header de prueba (manual del usuario)
    const testCountry = req.headers["x-test-country"];
    if (testCountry) return testCountry.toUpperCase();

    // 2. Header enviado por el cliente (si existe)
    const clientCountry = req.headers["x-client-country"];
    if (clientCountry) return clientCountry.toUpperCase();

    // 3. Headers de infraestructura (Vercel/Cloudflare)
    const geoCountry =
      req.headers["x-vercel-ip-country"] || req.headers["cf-ipcountry"];
    if (geoCountry) return geoCountry.toUpperCase();

    // 4. Fallback: Loguear para diagnóstico en VPS si no hay headers de geo
    return "";
  }

  /**
   * Determina la moneda a usar basado en el contexto (header o predeterminado).
   * REGLA: País de Origen -> Moneda Base. Otros -> USD (Internacional).
   */
  async getCurrencyByContext(req) {
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const businessCountry = config?.country?.toUpperCase().trim();
    if (!businessCountry)
      throw new Error("Store country configuration is missing.");
    const baseCurrency = config?.baseCurrency;
    if (!baseCurrency)
      throw new Error("Base currency not configured in StoreConfig.");

    const countryCode = this.getCountryByContext(req);

    // Prioridad 1: Test de país (Simulación)
    const isTest =
      req.headers["x-test-country"] || req.headers["x-client-country"];

    // Prioridad 2: Header de moneda manual (SOLO si NO es un test de país)
    const headerCurrency = req.headers["x-currency"];
    if (headerCurrency && !isTest) {
      const exists = await this.getCurrencyByCode(headerCurrency);
      if (exists && exists.isActive) return exists.code;
    }

    // Prioridad 3: Lógica Binaria (Local vs Internacional)
    if (countryCode) {
      const normalizedClientCountry = countryCode.toUpperCase();
      const normalizedBusinessCountry = businessCountry.toUpperCase();

      // Normalización básica para Argentina (caso común en este proyecto)
      const isArgentina = (c) => c === "AR" || c === "ARGENTINA";

      const isOriginCountry =
        normalizedClientCountry === normalizedBusinessCountry ||
        (isArgentina(normalizedClientCountry) &&
          isArgentina(normalizedBusinessCountry));

      if (isOriginCountry) {
        return baseCurrency;
      }

      // Si no es el país de origen, intentamos usar USD como estándar internacional
      const usdExists = await this.getCurrencyByCode("USD");
      if (usdExists && usdExists.isActive) return "USD";
    }

    // Prioridad 4: Fallback a x-currency header (seguridad ante fallas de resolución por país)
    const fallbackCurrency = req.headers["x-currency"];
    if (fallbackCurrency) {
      const exists = await this.getCurrencyByCode(fallbackCurrency);
      if (exists && exists.isActive) return exists.code;
    }

    return baseCurrency;
  }

  /**
   * Responde si un país dado es el mismo que el país configurado en la tienda.
   */
  async isLocalCountry(countryCode) {
    if (!countryCode) return true;
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const businessCountry = (config?.country || "AR").toUpperCase().trim();
    const clientCountry = countryCode.toUpperCase().trim();

    // Normalización básica para Argentina (caso común en este proyecto)
    const isArgentina = (c) => c === "AR" || c === "ARGENTINA";

    if (isArgentina(businessCountry) && isArgentina(clientCountry)) return true;

    return clientCountry === businessCountry;
  }
}

module.exports = new CurrencyService();
