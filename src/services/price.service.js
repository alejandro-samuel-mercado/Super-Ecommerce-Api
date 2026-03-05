const prisma = require('../config/prisma');

class PriceService {
  /**
   * Obtiene el precio de un producto en la moneda solicitada.
   * Lógica:
   * 1. Buscar precio manual en ProductPrice.
   * 2. Si no existe, convertir Product.basePrice usando Currency.exchangeRateToBase.
   */
  async getProductPrice(productId, currencyCode) {
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = config?.baseCurrency || 'USD';

    // 1. Intentar obtener precio manual
    const manualPrice = await prisma.productPrice.findUnique({
      where: {
        productId_currencyCode: {
          productId: parseInt(productId),
          currencyCode: currencyCode
        }
      }
    });

    if (manualPrice) {
      return parseFloat(manualPrice.price.toString());
    }

    // 2. Obtener producto y moneda para conversión
    const product = await prisma.product.findUnique({
      where: { id: parseInt(productId) },
      select: { basePrice: true }
    });

    if (!product) throw new Error('Product not found');

    if (currencyCode === baseCurrency) {
      return parseFloat(product.basePrice.toString());
    }

    const currency = await prisma.currency.findUnique({
      where: { code: currencyCode }
    });

    if (!currency || !currency.isActive) {
      return parseFloat(product.basePrice.toString());
    }

    const exchangeRate = parseFloat(currency.exchangeRateToBase.toString());
    return parseFloat(product.basePrice.toString()) * exchangeRate;
  }

  /**
   * Obtiene el precio de un SKU específico en la moneda solicitada.
   * Si hay un precio manual para el producto padre, lo escala proporcionalmente.
   */
  async getSkuPrice(skuId, currencyCode) {
    const sku = await prisma.sKU.findUnique({
      where: { id: parseInt(skuId) },
      include: { product: true }
    });

    if (!sku) throw new Error('SKU not found');

    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = config?.baseCurrency || 'USD';

    // 1. Buscar precio manual para el producto padre
    const manualPrice = await prisma.productPrice.findUnique({
      where: {
        productId_currencyCode: {
          productId: sku.productId,
          currencyCode: currencyCode
        }
      }
    });

    let scalingRatio = 1.0;

    if (manualPrice) {
      const basePrice = parseFloat(sku.product.basePrice.toString());
      if (basePrice > 0) {
        scalingRatio = parseFloat(manualPrice.price.toString()) / basePrice;
      } else {
        const currency = await prisma.currency.findUnique({
          where: { code: currencyCode }
        });
        if (currency && currency.isActive) {
          scalingRatio = parseFloat(currency.exchangeRateToBase.toString());
        }
      }
    } else if (currencyCode !== baseCurrency) {
      const currency = await prisma.currency.findUnique({
        where: { code: currencyCode }
      });
      if (currency && currency.isActive) {
        scalingRatio = parseFloat(currency.exchangeRateToBase.toString());
      }
    }

    return parseFloat(sku.price.toString()) * scalingRatio;
  }

  /**
   * Obtiene precios para múltiples SKUs a la vez (optimizado).
   */
  async getMultipleSkuPrices(skuIds, currencyCode) {
    const skus = await prisma.sKU.findMany({
      where: { id: { in: skuIds.map(id => parseInt(id)) } },
      include: { product: true }
    });

    const productIds = [...new Set(skus.map(s => s.productId))];
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = config?.baseCurrency || 'USD';

    // 1. Obtener todos los precios manuales de una vez
    const manualPrices = await prisma.productPrice.findMany({
      where: {
        productId: { in: productIds },
        currencyCode: currencyCode
      }
    });
    const manualPricesMap = new Map(manualPrices.map(mp => [mp.productId, parseFloat(mp.price.toString())]));

    // 2. Obtener moneda para fallback
    let exchangeRatio = 1.0;
    if (currencyCode !== baseCurrency) {
      const currency = await prisma.currency.findUnique({ where: { code: currencyCode } });
      if (currency && currency.isActive) {
        exchangeRatio = parseFloat(currency.exchangeRateToBase.toString());
      }
    }

    const pricesMap = {};
    skus.forEach(sku => {
       const manualPrice = manualPricesMap.get(sku.productId);
       let scalingRatio = 1.0;

       if (manualPrice) {
           const basePrice = parseFloat(sku.product.basePrice.toString());
           if (basePrice > 0) {
               scalingRatio = manualPrice / basePrice;
           } else if (currencyCode !== baseCurrency) {
               scalingRatio = exchangeRatio;
           }
       } else if (currencyCode !== baseCurrency) {
           scalingRatio = exchangeRatio;
       }
       
       pricesMap[sku.id] = parseFloat(sku.price.toString()) * scalingRatio;
    });

    return pricesMap;
  }

  /**
   * Obtiene precios para múltiples productos a la vez (optimizado).
   */
  async getMultipleProductPrices(productIds, currencyCode) {
     const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
     const baseCurrency = config?.baseCurrency || 'USD';

     // 1. Obtener todos los precios manuales de una vez
     const manualPrices = await prisma.productPrice.findMany({
       where: {
         productId: { in: productIds.map(id => parseInt(id)) },
         currencyCode: currencyCode
       }
     });

     const manualPricesMap = new Map(manualPrices.map(mp => [mp.productId, parseFloat(mp.price.toString())]));

     // 2. Obtener moneda si es necesario para el fallback
     let exchangeRatio = 1.0;
     if (currencyCode !== baseCurrency) {
       const currency = await prisma.currency.findUnique({ where: { code: currencyCode } });
       if (currency && currency.isActive) {
         exchangeRatio = parseFloat(currency.exchangeRateToBase.toString());
       }
     }

     // 3. Obtener productos para calcular ratios
     const products = await prisma.product.findMany({
       where: { id: { in: productIds.map(id => parseInt(id)) } },
       select: { id: true, basePrice: true }
     });

     return products.map(p => {
       const manualPrice = manualPricesMap.get(p.id);
       if (manualPrice !== undefined) {
           return { productId: p.id, price: manualPrice, ratio: manualPrice / parseFloat(p.basePrice.toString()) };
       }
       return {
         productId: p.id,
         price: parseFloat(p.basePrice.toString()) * exchangeRatio,
         ratio: exchangeRatio
       };
     });
  }
}

module.exports = new PriceService();
