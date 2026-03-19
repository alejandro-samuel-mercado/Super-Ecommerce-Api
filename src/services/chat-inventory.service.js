const prisma = require('../config/prisma');

class ChatInventoryService {

  async getInventoryResponse(message) {
    const msg = message.toLowerCase().replace(/[¿?¡!.,]/g, '').trim();
    const intent = this._detectIntent(msg);
    if (!intent) return null;

    try {
      switch (intent.type) {
        case 'CATEGORIES': return await this._handleCategories();
        case 'PRODUCTS_BY_CATEGORY': return await this._handleProductsByCategory(intent.query);
        case 'PRODUCT_SEARCH': return await this._handleProductSearch(intent.query);
        case 'PRODUCT_SEARCH_DIRECT': {
          const res = await this._handleProductSearch(intent.query);
          return res.includes('No encontré') ? null : res; // Si es fallback directo y no hay nada, devolvemos null para que intente el fallback del admin
        }
        case 'STOCK': return await this._handleStock(intent.query);
        case 'VARIANTS': return await this._handleVariants(intent.query, intent.variantType);
        case 'PRICE': return await this._handlePrice(intent.query);
        case 'DESCRIPTION': return await this._handleDescription(intent.query);
        case 'RECOMMEND': return await this._handleRecommendations();
        default: return null;
      }
    } catch (err) {
      console.error('[ChatInventory] Error:', err.message);
      return null;
    }
  }

  _detectIntent(msg) {
    if (/(?:categor(i|í)as|categorias?|qu(e|é)\s+categor?|lista.*categor|qu(e|é)\s+venden|qu(e|é)\s+tienen)/.test(msg) && !this._extractProductName(msg, [])) {
      return { type: 'CATEGORIES' };
    }

    const recPatterns = /(?:recom[ie]nd|suger|populares|tendenci|trending|m[aá]s\s+vendid|destacad|lo\s+mejor)/i;
    if (recPatterns.test(msg)) {
      return { type: 'RECOMMEND' };
    }

    const catMatch = msg.match(/(?:productos?|que|qu[eé])\s+(?:hay|tienen?|de|en|para|la\s+categor[ií]a)?\s*["']?([a-zA-Z0-9\s]+)["']?$/i);
    // Verificar si el match es una categoría y no un producto intentando matchear palabras comunes de categorias, o simplemente lo dejamos tratar como cat.
    // Una regex mejor para esto:
    const specificCatMatch = msg.match(/(?:productos?\s+(?:de|en|para)\s+(?:la\s+)?(?:categor[ií]a\s+)?["']?(.+?)["']?$)|(?:(?:que|qu[eé])\s+(?:hay|tienen?|venden)\s+(?:de|en)\s+["']?(.+?)["']?$)/i);
    if (specificCatMatch) {
      return { type: 'PRODUCTS_BY_CATEGORY', query: (specificCatMatch[1] || specificCatMatch[2]).trim() };
    }

    const stockMatch = msg.match(/(?:stock|disponibil|hay|tienen?|quedan?|tene[s]?)\s+(?:de[l]?\s+a?l?|stock\s+de[l]?)?\s*["']?(.+?)["']?$/i)
                     || msg.match(/["']?(.+?)["']?\s+(?:hay|tienen?|quedan?|tene[s]?)\s+stock\??/i);
    if (stockMatch && !/(?:categor(i|í)as)/.test(stockMatch[1])) {
      return { type: 'STOCK', query: stockMatch[1].trim() };
    }

    const talleMatch = msg.match(/(?:talle|talles|talla|tallas|tamaño|medida|medidas)?s?\s+(?:tienen?|hay|tene[s]?|de[l]?)?\s*["']?(.+?)["']?$/i);
    if (talleMatch && /(talle|talla|tamaño|medida)/.test(msg)) {
      return { type: 'VARIANTS', query: talleMatch[1].trim(), variantType: 'Talle' };
    }

    const colorMatch = msg.match(/(?:color|colore|colores)?s?\s+(?:tienen?|hay|tene[s]?|de[l]?)?\s*["']?(.+?)["']?$/i);
    if (colorMatch && /(color)/.test(msg)) {
      return { type: 'VARIANTS', query: colorMatch[1].trim(), variantType: 'Color' };
    }

    const variantMatch = msg.match(/(?:variante|variants|versione?s?)\s+(?:de[l]?\s+)?["']?(.+?)["']?$/i);
    if (variantMatch && /(variante|version)/.test(msg)) {
      return { type: 'VARIANTS', query: variantMatch[1].trim(), variantType: null };
    }

    const priceMatch = msg.match(/(?:precio|cu[aá]nto\s+(?:sale|cuesta|vale|esta|est[á])|valor)\s+(?:el\s+|la\s+|los\s+|las\s+|de[l]?\s+)?["']?(.+?)["']?$/i);
    if (priceMatch) {
      return { type: 'PRICE', query: priceMatch[1].trim() };
    }

    const descMatch = msg.match(/(?:descripci[oó]n|info(?:rmaci[oó]n)?|detalles?|especificacion|caracter[ií]sticas?|que\s+tiene|c[oó]mo\s+es)\s+(?:el\s+|la\s+|los\s+|las\s+|de[l]?\s+)?["']?(.+?)["']?$/i);
    if (descMatch) {
      return { type: 'DESCRIPTION', query: descMatch[1].trim() };
    }

    const searchPatterns = [
      /(?:tienen?|busco|hay|quer[ií]a|necesito|me\s+interesa|tenes|vend[eé]s)\s+(?:un\s+|una\s+|unos\s+|unas\s+|el\s+|la\s+|los\s+|las\s+)?["']?(.+?)["']?$/i,
    ];
    for (const pattern of searchPatterns) {
      const match = msg.match(pattern);
      if (match) {
        const query = match[1].trim();
        if (query.length > 2 && !/^(algo|eso|esto|producto|ayuda|info|hola|gracias|stock|precio)$/i.test(query)) {
          return { type: 'PRODUCT_SEARCH', query };
        }
      }
    }

    // Direct product name fallback (if the user just types "zapatillas nike" without verbs)
    if (msg.split(' ').length <= 4 && msg.length > 3) {
      if (!/^(hola|ayuda|stock|precio|gracias|adios|chau|buenos|buenas|tardes|dias|noches)$/i.test(msg)) {
        return { type: 'PRODUCT_SEARCH_DIRECT', query: msg }; 
      }
    }

    return null;
  }

  async _handleCategories() {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: { children: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    if (categories.length === 0) return 'No hay categorías disponibles en este momento.';

    let response = 'Estas son nuestras categorías:\n\n';
    categories.forEach(cat => {
      response += `• ${cat.name}`;
      if (cat.children.length > 0) {
        response += ` (${cat.children.map(c => c.name).join(', ')})`;
      }
      response += '\n';
    });
    response += '\nPuedes preguntarme "productos de [categoría]" para ver qué tenemos.';
    return response;
  }

  async _handleProductsByCategory(query) {
    const category = await prisma.category.findFirst({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { slug: { contains: query, mode: 'insensitive' } },
        ],
      },
    });

    if (!category) return `No encontré la categoría "${query}". Puedes preguntarme "categorías" para ver las disponibles.`;

    const products = await prisma.product.findMany({
      where: { categoryId: category.id, isActive: true, isDeleted: false },
      select: { name: true, brand: true, basePrice: true },
      orderBy: { name: 'asc' },
      take: 15,
    });

    if (products.length === 0) return `No hay productos disponibles en la categoría "${category.name}" en este momento.`;

    let response = `Productos en "${category.name}":\n\n`;
    products.forEach(p => {
      response += `• ${p.name}${p.brand ? ` (${p.brand})` : ''} — $${Number(p.basePrice).toLocaleString('es-AR')}\n`;
    });
    if (products.length === 15) response += '\n... y más productos disponibles.';
    response += '\n\nPuedes preguntarme precio, stock, talles o descripción de cualquier producto.';
    return response;
  }

  async _handleProductSearch(query) {
    const rawQuery = query.toLowerCase().trim();
    const words = rawQuery.split(' ').filter(w => w.length > 2);
    
    const orConditions = [
      { name: { contains: rawQuery, mode: 'insensitive' } },
      { brand: { contains: rawQuery, mode: 'insensitive' } },
      { description: { contains: rawQuery, mode: 'insensitive' } },
    ];
    words.forEach(w => orConditions.push({ name: { contains: w, mode: 'insensitive' } }));

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        OR: orConditions,
      },
      select: { name: true, brand: true, basePrice: true, category: { select: { name: true } } },
      take: 20,
    });

    if (products.length === 0) return `No encontré productos que coincidan con "${query}". Intenta con otro término o pregunta por nuestras categorías.`;

    products.sort((a, b) => {
      let scoreA = words.filter(w => a.name.toLowerCase().includes(w)).length;
      let scoreB = words.filter(w => b.name.toLowerCase().includes(w)).length;
      if (a.name.toLowerCase().includes(rawQuery)) scoreA += 10;
      if (b.name.toLowerCase().includes(rawQuery)) scoreB += 10;
      return scoreB - scoreA;
    });

    const topProducts = products.slice(0, 10);
    let response = `Encontré resultado${topProducts.length > 1 ? 's' : ''} para "${query}":\n\n`;
    topProducts.forEach(p => {
      response += `• ${p.name}${p.brand ? ` (${p.brand})` : ''} — $${Number(p.basePrice).toLocaleString('es-AR')} [${p.category.name}]\n`;
    });
    response += '\nPuedes preguntarme más detalles sobre cualquiera de estos productos.';
    return response;
  }

  async _handleStock(query) {
    const product = await this._findProduct(query);
    if (!product) return `No encontré el producto "${query}".`;

    const skus = await prisma.sKU.findMany({
      where: { productId: product.id, isDeleted: false },
      include: {
        variantOptions: true,
        branchInventory: {
          where: { isActive: true },
          include: { branch: { select: { name: true } } },
        },
      },
    });

    if (skus.length === 0) return `"${product.name}" no tiene stock registrado.`;

    let response = `Stock de "${product.name}":\n\n`;
    skus.forEach(sku => {
      const variants = sku.variantOptions.map(v => `${v.name}: ${v.value}`).join(' / ');
      const label = variants || sku.code;
      
      if (sku.branchInventory.length > 0) {
        sku.branchInventory.forEach(inv => {
          const stock = Number(inv.stock);
          const emoji = stock > 5 ? '🟢' : stock > 0 ? '🟡' : '🔴';
          response += `${emoji} ${label} — ${inv.branch.name}: ${stock} unidades\n`;
        });
      } else {
        const stock = Number(sku.stock);
        const emoji = stock > 5 ? '🟢' : stock > 0 ? '🟡' : '🔴';
        response += `${emoji} ${label}: ${stock} unidades\n`;
      }
    });
    return response;
  }

  async _handleVariants(query, variantType) {
    const product = await this._findProduct(query);
    if (!product) return `No encontré el producto "${query}".`;

    const where = { productId: product.id, isDeleted: false };
    const skus = await prisma.sKU.findMany({
      where,
      include: { variantOptions: true },
    });

    const allVariants = {};
    skus.forEach(sku => {
      sku.variantOptions.forEach(vo => {
        if (variantType && vo.name.toLowerCase() !== variantType.toLowerCase()) return;
        if (!allVariants[vo.name]) allVariants[vo.name] = new Set();
        allVariants[vo.name].add(vo.value);
      });
    });

    const variantNames = Object.keys(allVariants);
    if (variantNames.length === 0) {
      return variantType 
        ? `ℹ"${product.name}" no tiene variantes de ${variantType}.`
        : `ℹ"${product.name}" no tiene variantes configuradas.`;
    }

    let response = `Variantes de "${product.name}":\n\n`;
    variantNames.forEach(name => {
      response += `• ${name}: ${[...allVariants[name]].join(', ')}\n`;
    });
    return response;
  }

  async _handlePrice(query) {
    const product = await this._findProduct(query);
    if (!product) return `No encontré el producto "${query}".`;

    const prices = await prisma.productPrice.findMany({
      where: { productId: product.id },
      include: { currency: { select: { code: true, symbol: true } } },
    });

    const skus = await prisma.sKU.findMany({
      where: { productId: product.id, isDeleted: false, active: true },
      include: { variantOptions: true },
    });

    let response = `Precios de "${product.name}":\n\n`;
    response += `• Precio base: $${Number(product.basePrice).toLocaleString('es-AR')}\n`;

    if (prices.length > 0) {
      response += '\nPrecios por moneda:\n';
      prices.forEach(p => {
        response += `• ${p.currency.code}: ${p.currency.symbol || ''}${Number(p.price).toLocaleString('es-AR')}\n`;
      });
    }

    if (skus.length > 1) {
      response += '\nPor variante:\n';
      skus.forEach(sku => {
        const variants = sku.variantOptions.map(v => `${v.name}: ${v.value}`).join(' / ');
        if (variants) {
          response += `• ${variants} — $${Number(sku.price).toLocaleString('es-AR')}\n`;
        }
      });
    }

    return response;
  }

  async _handleDescription(query) {
    const product = await prisma.product.findFirst({
      where: {
        isActive: true,
        isDeleted: false,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { name: true, description: true, brand: true, model: true, characteristics: true, specifications: true, category: { select: { name: true } } },
    });

    if (!product) return `No encontré el producto "${query}".`;

    let response = `${product.name}\n`;
    if (product.brand) response += `Marca: ${product.brand}\n`;
    if (product.model) response += `Modelo: ${product.model}\n`;
    response += `Categoría: ${product.category.name}\n\n`;

    if (product.description) {
      const cleanDesc = product.description.replace(/<[^>]*>/g, '').substring(0, 500);
      response += `${cleanDesc}\n`;
    }

    if (product.specifications && typeof product.specifications === 'object') {
      const specs = Array.isArray(product.specifications) ? product.specifications : Object.entries(product.specifications);
      if (specs.length > 0) {
        response += '\nEspecificaciones:\n';
        if (Array.isArray(product.specifications)) {
          specs.forEach(s => {
            if (s.key && s.value) response += `• ${s.key}: ${s.value}\n`;
            else if (s.name && s.value) response += `• ${s.name}: ${s.value}\n`;
          });
        } else {
          specs.forEach(([key, value]) => {
            response += `• ${key}: ${value}\n`;
          });
        }
      }
    }

    if (product.characteristics && typeof product.characteristics === 'object') {
      const chars = Array.isArray(product.characteristics) ? product.characteristics : Object.entries(product.characteristics);
      if (chars.length > 0) {
        response += '\nCaracterísticas:\n';
        if (Array.isArray(product.characteristics)) {
          chars.forEach(c => {
            if (typeof c === 'string') response += `• ${c}\n`;
            else if (c.key && c.value) response += `• ${c.key}: ${c.value}\n`;
            else if (c.name && c.value) response += `• ${c.name}: ${c.value}\n`;
          });
        } else {
          chars.forEach(([key, value]) => {
            response += `• ${key}: ${value}\n`;
          });
        }
      }
    }

    return response;
  }

  async _handleRecommendations() {
    const recommended = await prisma.product.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        OR: [{ isRecommended: true }, { isTrending: true }],
      },
      select: { name: true, brand: true, basePrice: true, isRecommended: true, isTrending: true, category: { select: { name: true } } },
      take: 10,
    });

    if (recommended.length === 0) {
      const recent = await prisma.product.findMany({
        where: { isActive: true, isDeleted: false },
        select: { name: true, brand: true, basePrice: true, category: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      if (recent.length === 0) return 'No tenemos recomendaciones en este momento.';

      let response = 'Nuestros productos más recientes:\n\n';
      recent.forEach(p => {
        response += `• ${p.name}${p.brand ? ` (${p.brand})` : ''} — $${Number(p.basePrice).toLocaleString('es-AR')} [${p.category.name}]\n`;
      });
      return response;
    }

    let response = 'Nuestras recomendaciones:\n\n';
    recommended.forEach(p => {
      const tags = [];
      if (p.isTrending) tags.push('Tendencia');
      if (p.isRecommended) tags.push('Recomendado');
      response += `• ${p.name}${p.brand ? ` (${p.brand})` : ''} — $${Number(p.basePrice).toLocaleString('es-AR')} ${tags.join(' ')}\n`;
    });
    response += '\nPregúntame por más detalles de cualquier producto.';
    return response;
  }

  async _findProduct(query) {
    const rawQuery = query.toLowerCase().trim();
    let p = await prisma.product.findFirst({
      where: {
        isActive: true,
        isDeleted: false,
        OR: [
          { name: { contains: rawQuery, mode: 'insensitive' } },
          { brand: { contains: rawQuery, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, basePrice: true },
    });
    if (p) return p;

    const words = rawQuery.split(' ').filter(w => w.length > 2);
    if (words.length > 0) {
      const orConditions = words.map(w => ({ name: { contains: w, mode: 'insensitive' } }));
      const products = await prisma.product.findMany({
        where: { isActive: true, isDeleted: false, OR: orConditions },
        select: { id: true, name: true, basePrice: true },
        take: 10
      });
      if (products.length > 0) {
        products.sort((a, b) => {
          let scoreA = words.filter(w => a.name.toLowerCase().includes(w)).length;
          let scoreB = words.filter(w => b.name.toLowerCase().includes(w)).length;
          return scoreB - scoreA;
        });
        return products[0];
      }
    }
    return null;
  }

  _extractProductName(msg, knownPatterns) {
    for (const p of knownPatterns) {
      const m = msg.match(p);
      if (m) return m[1]?.trim();
    }
    return null;
  }
}

module.exports = new ChatInventoryService();
