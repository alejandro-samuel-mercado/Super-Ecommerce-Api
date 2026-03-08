const prisma = require('../config/prisma');

class DiscountService {
  
  /**
   * Evalúa y calcula los descuentos aplicables a una preventa.
   * @param {Object} context - { items: [], user: {}, paymentType: 'CASH' }
   * @returns {Promise<Object>} { appliedDiscounts: [], totalDiscountAmount: 0 }
   */
  async expandCategoryTargets(discounts) {
      if (!discounts || discounts.length === 0) return discounts;
      const categories = await prisma.category.findMany();
      const getSubs = (parentId) => {
          let ids = [];
          const children = categories.filter(c => c.parentId === Number(parentId));
          for (const child of children) {
              ids.push(child.id);
              ids.push(...getSubs(child.id));
          }
          return ids;
      };

      for (const discount of discounts) {
          const config = this.normalizeConfig(discount);
          for (const target of config.targets) {
              if (target.type === 'CATEGORY') {
                  const expanded = [];
                  const baseValues = Array.isArray(target.value) ? target.value : [target.value];
                  for (const val of baseValues) {
                      expanded.push(String(val));
                      const subs = getSubs(val);
                      subs.forEach(s => expanded.push(String(s)));
                  }
                  target.value = [...new Set(expanded)];
              }
          }
          discount._config = config;
      }
      return discounts;
  }

  async calculateDiscounts(context) {
    const { items, user, paymentType, currencyCode } = context;
    const appliedDiscounts = [];
    let totalDiscountAmount = 0;

    const now = new Date();
    const EventService = require('./event.service');
    let activeEvent = null;
    try {
        activeEvent = await EventService.getActiveEvent();
    } catch (e) {
        console.error('[DiscountService] Error fetching active event:', e.message);
    }

    let whereClause = { active: true };
    
    if (activeEvent) {
        whereClause.eventId = activeEvent.id;
    } else {
        whereClause.eventId = null;
    }

    const allDiscounts = await prisma.discount.findMany({
      where: whereClause,
      include: { event: true },
      orderBy: { priority: 'desc' }
    });

    await this.expandCategoryTargets(allDiscounts);

    const validDiscounts = allDiscounts.filter(d => {
       // Defensa extra: Si hay un evento activo, saltar cualquier descuento que no le pertenezca
       // (Aunque el findMany ya debería haberlo filtrado)
       if (activeEvent && d.eventId !== activeEvent.id) return false;
       // Si no hay evento activo, saltar cualquier descuento que tenga un eventId
       if (!activeEvent && d.eventId !== null) return false;

       // Verificar Fechas del Evento (si tiene)
       const eventStart = d.event ? d.event.startDate : null;
       const eventEnd = d.event ? d.event.endDate : null;
       if (eventStart && now < eventStart) return false;
       if (eventEnd && now > eventEnd) return false;

       // Verificar Fechas Específicas del Descuento
       if (d.validFrom && now < d.validFrom) return false;
       if (d.validUntil && now > d.validUntil) return false;

       return true;
    });

     // 2. Evaluar candidatos
    const candidates = [];
    const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });

    for (const discount of validDiscounts) {
        const config = discount._config || this.normalizeConfig(discount);
        
        const matchedItems = this.matchItems(config.targets, items);

        if (matchedItems.length === 0) continue;

        // Paso B: Verificar Condiciones sobre los items afectados
        if (await this.checkConditions(config.conditions, matchedItems, context, storeConfig)) {
            // Paso C: Calcular Monto
            const amount = await this.calculateAmount(config.action || {}, matchedItems, discount, currencyCode, storeConfig);

            if (amount > 0) {
                candidates.push({ discount, amount, config });
            }
        } else {

        }
    }

    // 3. Aplicar reglas de Acumulación y Prioridad
    // candidates ya ordeados por prioridad desc debido al query, pero si hace falta re-sort:
    candidates.sort((a, b) => b.discount.priority - a.discount.priority);

    for (const candidate of candidates) {
        // Bloqueo de No-Acumulable
        // Si hay descuentos aplicados y el actual NO es stackable -> SKIP
        if (!candidate.discount.stackable && appliedDiscounts.length > 0) {
            continue; 
        }

        // Si ya hay un descuento NO stackable aplicado -> SKIP (ya bloqueó todo)
        if (appliedDiscounts.some(d => !d.stackable)) {
             continue;
        }

        // Aplicar
        appliedDiscounts.push({
            id: candidate.discount.id,
            name: candidate.discount.name,
            type: candidate.config.action?.type || candidate.discount.type,
            val: candidate.config.action?.value || candidate.discount.value,
            discountAmount: candidate.amount,
            stackable: candidate.discount.stackable
        });
        
        totalDiscountAmount += candidate.amount;
    }

    // Límite de Seguridad: No descontar más del total
    // Nota: El subtotal base puede variar si calculamos sobre items.
    // Aquí asumimos suma simple.
    const cartTotal = items.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * i.quantity), 0);
    if (totalDiscountAmount > cartTotal) totalDiscountAmount = cartTotal;

    return { appliedDiscounts, totalDiscountAmount };
  }

  /**
   * Helper para obtener el descuento aplicable a un solo producto (para listados/detalle)
   * @param {Object} product - Producto con categoryId, id, brand, etc.
   * @returns {Promise<Object>} { originalPrice, discountedPrice, discountPercentage, appliedDiscounts }
   */
  async getDiscountForProduct(product, context = {}) {
    const items = [{
        productId: product.id,
        quantity: 1,
        unitPrice: product.price || product.basePrice,
        product: product,
        sku: product.skus ? product.skus[0] : { code: 'DEFAULT' }
    }];

    const { appliedDiscounts, totalDiscountAmount } = await this.calculateDiscounts({
        ...context,
        items
    });

    const originalPrice = parseFloat(product.price || product.basePrice);
    const discountedPrice = originalPrice - totalDiscountAmount;
    const discountPercentage = originalPrice > 0 ? Math.round((totalDiscountAmount / originalPrice) * 100) : 0;

    return {
        originalPrice,
        discountedPrice,
        discountPercentage,
        appliedDiscounts
    };
  }

  /**
   * Batch: Evalúa descuentos para múltiples productos en una sola pasada.
   * Pre-carga descuentos activos, evento y config UNA VEZ, luego evalúa cada producto en memoria.
   */
  async getDiscountsForProducts(products, context = {}) {
    const now = new Date();
    const EventService = require('./event.service');
    let activeEvent = null;
    try {
        activeEvent = await EventService.getActiveEvent();
    } catch (e) {}

    let whereClause = { active: true };
    if (activeEvent) {
        whereClause.eventId = activeEvent.id;
    } else {
        whereClause.eventId = null;
    }

    const [allDiscounts, storeConfig] = await Promise.all([
      prisma.discount.findMany({
        where: whereClause,
        include: { event: true },
        orderBy: { priority: 'desc' }
      }),
      prisma.storeConfig.findFirst({ where: { id: 1 } })
    ]);

    await this.expandCategoryTargets(allDiscounts);

    const validDiscounts = allDiscounts.filter(d => {
       if (activeEvent && d.eventId !== activeEvent.id) return false;
       if (!activeEvent && d.eventId !== null) return false;
       const eventStart = d.event ? d.event.startDate : null;
       const eventEnd = d.event ? d.event.endDate : null;
       if (eventStart && now < eventStart) return false;
       if (eventEnd && now > eventEnd) return false;
       if (d.validFrom && now < d.validFrom) return false;
       if (d.validUntil && now > d.validUntil) return false;
       return true;
    });

    const results = {};
    for (const product of products) {
      const items = [{
          productId: product.id,
          quantity: 1,
          unitPrice: product.price || product.basePrice,
          product: product,
          sku: product.skus ? product.skus[0] : { code: 'DEFAULT' }
      }];

      const appliedDiscounts = [];
      let totalDiscountAmount = 0;
      const candidates = [];

      for (const discount of validDiscounts) {
          const config = discount._config || this.normalizeConfig(discount);
          const matchedItems = this.matchItems(config.targets, items);
          if (matchedItems.length === 0) continue;
          if (await this.checkConditions(config.conditions, matchedItems, { ...context, items }, storeConfig)) {
              const amount = await this.calculateAmount(config.action || {}, matchedItems, discount, context.currencyCode, storeConfig);
              if (amount > 0) {
                  candidates.push({ discount, amount, config });
              }
          }
      }

      candidates.sort((a, b) => b.discount.priority - a.discount.priority);
      for (const candidate of candidates) {
          if (!candidate.discount.stackable && appliedDiscounts.length > 0) continue;
          if (appliedDiscounts.some(d => !d.stackable)) continue;
          appliedDiscounts.push({
              id: candidate.discount.id,
              name: candidate.discount.name,
              type: candidate.config.action?.type || candidate.discount.type,
              val: candidate.config.action?.value || candidate.discount.value,
              discountAmount: candidate.amount,
              stackable: candidate.discount.stackable
          });
          totalDiscountAmount += candidate.amount;
      }

      const cartTotal = items.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * i.quantity), 0);
      if (totalDiscountAmount > cartTotal) totalDiscountAmount = cartTotal;

      const originalPrice = parseFloat(product.price || product.basePrice);
      const discountedPrice = originalPrice - totalDiscountAmount;
      const discountPercentage = originalPrice > 0 ? Math.round((totalDiscountAmount / originalPrice) * 100) : 0;

      results[product.id] = {
          originalPrice,
          discountedPrice,
          discountPercentage,
          appliedDiscounts
      };
    }

    return results;
  }

  /**
   * Convierte el modelo de datos mixto (legacy columns + json rules) a una estructura uniforme
   */
  normalizeConfig(discount) {
      if (discount.rules) {
          // Nuevo Sistema - PERO sobreescribir accion con columnas de alto nivel si existen
          // Esto asegura que inputs simples de Admin sean fuente de verdad
          const config = { ...discount.rules };
          config.action = {
              type: discount.type || config.action?.type || 'PERCENTAGE',
              value: parseFloat(discount.value) ?? parseFloat(config.action?.value || 0)
          };
          return config;
      }
      
      // Adaptador Sistema Legacy
      const targets = [];
      if (discount.scope === 'GLOBAL') {
          targets.push({ type: 'GLOBAL' });
      } else {
          targets.push({ 
              type: discount.scope, 
              value: discount.targetIds 
          });
      }

      const conditions = [];
      if (discount.conditions) {
        
          if (discount.conditions.minQty) conditions.push({ type: 'MIN_QTY', value: discount.conditions.minQty, unit: 'UNIDAD' });
          if (discount.conditions.paymentMethod) conditions.push({ type: 'PAYMENT_METHOD', value: discount.conditions.paymentMethod });
          
      }

      return {
          targets,
          conditions,
          action: {
              type: discount.type,
              value: parseFloat(discount.value)
          }
      };
  }

  /**
   * Filtra los items del carrito que coinciden con los targets
   */
  matchItems(targets, items) {
      if (!targets || targets.length === 0) return [];

      // Si hay un target GLOBAL, devuelve todos excepto excluidos (si hubiera)
      if (targets.some(t => t.type === 'GLOBAL')) {
          return items;
      }

      return items.filter(item => {
          return targets.some(target => {
              
              const rawValues = target.value ?? target.id;
              const values = (Array.isArray(rawValues) ? rawValues : [rawValues])
                  .map(v => String(v));

              if (target.type === 'CATEGORY') {
                  const catId = item.product?.categoryId;
                  return catId !== undefined && values.includes(String(catId));
              }
              if (target.type === 'PRODUCT') {
                  const pid = item.product?.id;
                  return pid !== undefined && values.includes(String(pid));
              }
              if (target.type === 'BRAND') {
                  const brand = item.product?.brand;
                  return brand && values.some(v => v.toLowerCase() === brand.toString().toLowerCase());
              }
              if (target.type === 'SKU') {
                  const code = item.sku?.code || item.skuCode;
                  return code && values.includes(String(code));
              }
              return false;
          });
      });
  }

  /**
   * Verifica si los items matcheados cumplen las condiciones 
   */
   async checkConditions(conditions, matchedItems, context, config) {
      if (!conditions || conditions.length === 0) return true;

      for (const cond of conditions) {
          if (cond.type === 'MIN_QTY') {
              let total = 0;
              matchedItems.forEach(i => {
                  total += Number(i.quantity);
              });

              if (total < cond.value) return false;
          }
          
          if (cond.type === 'MIN_AMOUNT') {
              const itemsToSum = (context && context.items) ? context.items : matchedItems;
              const totalAmount = itemsToSum.reduce((acc, i) => acc + (parseFloat(i.unitPrice) * i.quantity), 0);
              
              let minAmountConverted = parseFloat(cond.value);
              
              const baseCurrency = config?.baseCurrency;
              if (!baseCurrency) throw new Error('Base currency not configured in StoreConfig');
              const currencyCode = context?.currencyCode || baseCurrency;
              
              if (currencyCode && currencyCode !== baseCurrency) {
                  const rate = await this.getExchangeRate(currencyCode);
                  minAmountConverted = minAmountConverted * rate;
              }

              if (totalAmount < minAmountConverted) return false;
          }

          if (cond.type === 'PAYMENT_METHOD') {
              if (context.paymentType !== cond.value) return false;
          }

      
      }
      return true;
  }

  /**
   * Calcula el monto final del descuento sobre los items matcheados
   */
  async calculateAmount(action, matchedItems, discount, currencyCode, config) {
      const type = action.type || discount.type;
      let value = parseFloat(action.value || discount.value);

      const baseCurrency = config?.baseCurrency;
      if (!baseCurrency) throw new Error('Base currency not configured in StoreConfig');

      if (currencyCode && currencyCode !== baseCurrency) {
          if (type === 'FIXED_AMOUNT' || type === 'FIXED_PRICE') {
              const rate = await this.getExchangeRate(currencyCode);
              value = value * rate;
          }
      }

      let amount = 0;
      const subtotal = matchedItems.reduce((acc, i) => acc + (parseFloat(i.unitPrice) * i.quantity), 0);

      if (type === 'PERCENTAGE') {
          amount = subtotal * (value / 100);
      } else if (type === 'FIXED_AMOUNT') {
          if (action.applyPerUnit) {
               const totalUnits = matchedItems.reduce((acc, i) => acc + Number(i.quantity), 0);
               amount = value * totalUnits;
          } else {
               amount = value;
          }
          
          if (amount > subtotal) amount = subtotal;
      } else if (type === 'FIXED_PRICE') {
          matchedItems.forEach(i => {
              const currentPrice = parseFloat(i.unitPrice);
              if (currentPrice > value) {
                  amount += (currentPrice - value) * i.quantity;
              }
          });
      }

      return amount;
  }

  async getExchangeRate(currencyCode) {
      const currency = await prisma.currency.findUnique({ where: { code: currencyCode } });
      return (currency && currency.isActive) ? parseFloat(currency.exchangeRateToBase.toString()) : 1;
  }
}

module.exports = new DiscountService();
