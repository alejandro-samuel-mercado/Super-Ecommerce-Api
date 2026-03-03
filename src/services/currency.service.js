const prisma = require('../config/prisma');

class CurrencyService {
  currencyToCountry = {
    'ARS': 'AR',
    'MXN': 'MX',
    'CLP': 'CL',
    'COP': 'CO',
    'UYU': 'UY',
    'PEN': 'PE',
    'BOB': 'BO',
    'PYG': 'PY',
    'VES': 'VE',
    'CRC': 'CR',
    'DOP': 'DO',
    'GTQ': 'GT',
    'HNL': 'HN',
    'NIO': 'NI',
    'PAB': 'PA',
    'USD': 'US',
    'CAD': 'CA',
    'EUR': 'ES', 
    'GBP': 'GB',
    'CHF': 'CH',
    'BRL': 'BR'
  };
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
   * Determina la moneda a usar basado en el contexto (header o predeterminado).
   * REGLA: País de Origen -> Moneda Base. Otros -> USD.
   */
  async getCurrencyByContext(req) {
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = config?.baseCurrency || 'ARS';
    
    // Prioridad 1: Header x-currency (útil para pruebas o integraciones específicas)
    const headerCurrency = req.headers['x-currency'];
    if (headerCurrency) {
      const exists = await this.getCurrencyByCode(headerCurrency);
      if (exists && exists.isActive) return exists.code;
    }

    // Prioridad 2: Geo-IP Estricto
    const countryCode = (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase();
    
    if (countryCode) {
       // Mapeo dinámico de Moneda Base a País de Origen
       const originCountry = this.currencyToCountry[baseCurrency];

       // Si el usuario es del país de origen, usar moneda base.
       if (countryCode === originCountry) {
         return baseCurrency;
       }
       
       // Si es extranjero, forzar USD obligatoriamente (si existe y está activa)
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
      
      // Si se provejo un IP externo, y es radicalmente distinto al país base, es exportación: NO TAX.
      if (cleanIp && cleanIp !== originCountry) {
          return false;
      }

      // De lo contrario (Local o sin IP/localhost), asume local: APLICAMOS TAX.
      return true;
  }
}

module.exports = new CurrencyService();
