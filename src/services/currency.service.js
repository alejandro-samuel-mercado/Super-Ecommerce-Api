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
    'EUR': ['ES', 'FR', 'DE', 'IT', 'PT', 'NL', 'BE', 'AT', 'IE', 'FI', 'GR', 'LU', 'MT', 'CY', 'SK', 'SI', 'EE', 'LV', 'LT'],
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
   * Obtener el código de país del cliente basado en headers de IP (Vercel/CF)
   */
  getCountryByContext(req) {
    return (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase();
  }

  /**
   * Determina la moneda a usar basado en el contexto (header o predeterminado).
   * REGLA: País de Origen -> Moneda Base. Otros -> USD.
   */
  async getCurrencyByContext(req) {
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = config?.baseCurrency || 'ARS';
    
    const headerCurrency = req.headers['x-currency'];
    if (headerCurrency) {
      const exists = await this.getCurrencyByCode(headerCurrency);
      if (exists && exists.isActive) return exists.code;
    }

    const countryCode = this.getCountryByContext(req);
    
    if (countryCode) {
       const originCountry = this.currencyToCountry[baseCurrency];
       const isOriginCountry = Array.isArray(originCountry) 
           ? originCountry.includes(countryCode) 
           : countryCode === originCountry;

       if (isOriginCountry) {
         return baseCurrency;
       }

       for (const [code, countries] of Object.entries(this.currencyToCountry)) {
           const match = Array.isArray(countries) 
               ? countries.includes(countryCode) 
               : countries === countryCode;
           if (match && code !== baseCurrency) {
               const curr = await this.getCurrencyByCode(code);
               if (curr && curr.isActive) return curr.code;
           }
       }
       
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
