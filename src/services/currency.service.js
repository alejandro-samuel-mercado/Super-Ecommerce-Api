const prisma = require('../config/prisma');

class CurrencyService {
  async getAllCurrencies(onlyActive = true) {
    return await prisma.currency.findMany({
      where: onlyActive ? { isActive: true } : {},
      orderBy: { code: 'asc' }
    });
  }

  async getCurrencyByCode(code) {
    return await prisma.currency.findUnique({
      where: { code: code.toUpperCase() }
    });
  }

  async createCurrency(data) {
    return await prisma.currency.create({
      data: {
        code: data.code.toUpperCase(),
        symbol: data.symbol,
        exchangeRateToBase: parseFloat(data.exchangeRateToBase),
        isActive: data.isActive !== undefined ? data.isActive : true
      }
    });
  }

  async updateCurrency(id, data) {
    const updateData = {};
    if (data.symbol) updateData.symbol = data.symbol;
    if (data.exchangeRateToBase !== undefined) updateData.exchangeRateToBase = parseFloat(data.exchangeRateToBase);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return await prisma.currency.update({
      where: { id: parseInt(id) },
      data: updateData
    });
  }

  async deleteCurrency(id) {
    // No permitir borrar si es la moneda base de StoreConfig
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const currency = await prisma.currency.findUnique({ where: { id: parseInt(id) } });
    
    if (currency && config && currency.code === config.baseCurrency) {
      throw new Error('Cannot delete the base currency');
    }

    return await prisma.currency.delete({
      where: { id: parseInt(id) }
    });
  }

  /**
   * Obtener el código de país del cliente basado en headers de IP (Vercel/CF)
   */
  getCountryByContext(req) {
    // 1. Prioridad: Header de prueba (manual del usuario)
    const testCountry = req.headers['x-test-country'];
    if (testCountry) return testCountry.toUpperCase();

    // 2. Header enviado por el cliente (si existe)
    const clientCountry = req.headers['x-client-country'];
    if (clientCountry) return clientCountry.toUpperCase();

    // 3. Headers de infraestructura (Vercel/Cloudflare)
    const geoCountry = req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'];
    if (geoCountry) return geoCountry.toUpperCase();

    // 4. Fallback: Loguear para diagnóstico en VPS si no hay headers de geo
    return '';
  }

  /**
   * Determina la moneda a usar basado en el contexto (header o predeterminado).
   * REGLA: País de Origen -> Moneda Base. Otros -> USD (Internacional).
   */
  async getCurrencyByContext(req) {
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const businessCountry = (config?.country || 'AR').toUpperCase().trim();
    const baseCurrency = config?.baseCurrency || 'ARS';
    
    const countryCode = this.getCountryByContext(req);
    
    // Prioridad 1: Test de país (Simulación)
    const isTest = req.headers['x-test-country'] || req.headers['x-client-country'];

    // Prioridad 2: Header de moneda manual (SOLO si NO es un test de país)
    const headerCurrency = req.headers['x-currency'];
    if (headerCurrency && !isTest) {
      const exists = await this.getCurrencyByCode(headerCurrency);
      if (exists && exists.isActive) return exists.code;
    }

    // Prioridad 3: Lógica Binaria (Local vs Internacional)
    if (countryCode) {
       const normalizedClientCountry = countryCode.toUpperCase();
       const normalizedBusinessCountry = businessCountry.toUpperCase();
       
       // Si el país de la base de datos es un código ISO (2 letras), la comparación es directa y universal
       const isOriginCountry = normalizedClientCountry === normalizedBusinessCountry;

       if (isOriginCountry) {
         return baseCurrency;
       }
       
       // Si no es el país de origen, forzamos USD para el resto del mundo
       const usdExists = await this.getCurrencyByCode('USD');
       if (usdExists && usdExists.isActive) return 'USD';
    }

    return baseCurrency;
  }

  /**
   * Valida si el cliente es local para aplicar impuestos usando IP de Vercel/Cloudflare
   * validando que la IP coincida con el país asignado a la Moneda Base.
   */
  isLocalTransaction(ipCountryCode, baseCurrencyCode) {
      if (!baseCurrencyCode) return true;
      
      const originCountry = this.currencyToCountry[baseCurrencyCode];
      if (!originCountry) return true;

      const cleanIp = (ipCountryCode || '').toUpperCase().trim();
      
      if (cleanIp) {
          const isLocal = Array.isArray(originCountry) 
              ? originCountry.includes(cleanIp) 
              : cleanIp === originCountry;
          if (!isLocal) return false;
      }

      return true;
  }
}

module.exports = new CurrencyService();
