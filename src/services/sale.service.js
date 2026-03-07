const prisma = require('../config/prisma');
const PriceService = require('./price.service');
const CurrencyService = require('./currency.service');
const CouponService = require('./coupon.service');
const ShippingService = require('./shipping.service');
const DiscountService = require('./discount.service');
const PaymentAdapter = require('../adapters/payment.adapter');
const InAppNotificationService = require('./in-app-notification.service');
const EventService = require('./event.service');
const AuditService = require('./audit.service');

class SaleService {

  /**
   * Verifica si se creó una venta similar recientemente (Idempotencia)
   */
  async findRecentDuplicate(userId, items, currencyCode) {
      if (!userId) return null;
      
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      
      const where = {
          userId: parseInt(userId),
          createdAt: { gt: thirtySecondsAgo },
          paymentStatus: 'PENDING'
      };
      if (currencyCode) where.currencyCode = currencyCode;
      
      const recentSales = await prisma.sale.findMany({
          where,
          include: { items: true }
      });

      for (const sale of recentSales) {
         
          if (sale.items.length === items.length) {
              const allMatch = items.every(newItem => {
                  return sale.items.some(existingItem => 
                      existingItem.skuId === newItem.skuId && 
                      parseFloat(existingItem.quantity.toString()) === parseFloat(newItem.quantity.toString())
                  );
              });

              if (allMatch) return sale;
          }
      }
      return null;
  }

  async previewSale(saleData, userId) {
    const { items, couponCode, paymentType, deliveryType: inputDeliveryType, deliveryMethod, deliveryAddress, customer, employeeId, manualDiscount, pointsToUse, shippingCost: inputShippingCost, branchId, currency: requestedCurrency, address } = saleData;

    const aggregatedItemsMap = new Map();
    items.forEach(item => {
        if (!item.skuId) return;
        const sid = String(item.skuId);
        const rawQty = item.quantity ?? item.qty ?? 0;
        const qty = parseFloat(String(rawQty));
        aggregatedItemsMap.set(sid, (aggregatedItemsMap.get(sid) || 0) + qty);
    });
    const aggregatedItems = Array.from(aggregatedItemsMap.entries()).map(([skuId, quantity]) => ({ skuId, quantity }));
    const skuIds = Array.from(aggregatedItemsMap.keys()).map(id => parseInt(id));
    
    const [config, activeEvent, allSkus, allInventory, allReservations, branches, allCurrencies] = await Promise.all([
        prisma.storeConfig.findFirst({ where: { id: 1 } }),
        EventService.getActiveEvent(),
        prisma.sKU.findMany({ 
            where: { id: { in: skuIds } },
            include: { 
                variantOptions: true,
                product: { include: { category: true } }
            }
        }),
        prisma.branchInventory.findMany({ 
            where: { skuId: { in: skuIds }, isActive: true } 
        }),
        prisma.stockReservation.groupBy({
            by: ['skuId', 'branchInventoryId'],
            where: { 
                skuId: { in: skuIds }, 
                released: false,
                expiresAt: { gt: new Date() } 
            },
            _sum: { quantity: true }
        }),
        prisma.branch.findMany({ where: { isActive: true } }),
        prisma.currency.findMany()
    ]);

    const baseCurrencyCode = config?.baseCurrency || 'USD';
    const activeCurrencyCode = requestedCurrency || baseCurrencyCode;
    const currency = allCurrencies.find(c => c.code === activeCurrencyCode);

    if (!currency || !currency.isActive) throw new Error(`La moneda seleccionada no está activa o no fue encontrada.`);
    const exchangeRateAtPurchase = parseFloat(currency.exchangeRateToBase.toString());

    let user = null;
    if (userId) {
        user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    }

    const deliveryType = inputDeliveryType || (deliveryMethod === 'pickup' ? 'PICKUP' : deliveryMethod === 'shipping' ? 'DELIVERY' : deliveryMethod);
    let activeBranchId = Number(branchId);
    let aggregateStock = !(activeBranchId > 0);

    if (!aggregateStock) {
        const branchExists = branches.find(b => b.id === activeBranchId);
        if (!branchExists) throw new Error(`La sucursal con ID ${activeBranchId} no existe.`);
    }

    if (!items || items.length === 0) throw new Error('El carrito no puede estar vacío');
    const isPOS = !!employeeId;

    const skuPrices = await PriceService.getMultipleSkuPrices(skuIds, activeCurrencyCode);

    const supplierSkus = await prisma.supplierSKU.findMany({
        where: { skuId: { in: skuIds } },
        orderBy: { updatedAt: 'desc' }
    });

    console.log(`[PREVIEW_SALE] Previewing ${aggregatedItems.length} items for user ${userId || 'Guest'}`);

    const latestSupplierSkus = new Map();
    supplierSkus.forEach(ss => {
        if (!latestSupplierSkus.has(ss.skuId)) latestSupplierSkus.set(ss.skuId, ss);
    });

    let subtotal = 0;
    let totalPointsEarned = 0;
    const saleItemsData = [];
    const enrichedItems = [];
    const stockIssues = [];

    const skusMap = new Map(allSkus.map(s => [s.id, s]));
    const currencyMap = new Map(allCurrencies.map(c => [c.code, c]));

    aggregatedItems.sort((a, b) => parseInt(a.skuId) - parseInt(b.skuId));

    for (const item of aggregatedItems) {
        const skuIdInt = parseInt(item.skuId);
        const sku = skusMap.get(skuIdInt);
        if (!sku) throw new Error(`SKU ${item.skuId} no encontrado`);
        
        const product = sku.product;
        const itemQty = parseFloat((item.quantity || item.qty || 0).toString());

        if (itemQty % 1 !== 0 && product.measurementUnit === 'UNIDAD') {
            stockIssues.push({ skuId: skuIdInt, productName: product.name, requested: itemQty, available: Math.floor(itemQty), message: `Cantidad fraccionaria no permitida para venta por unidad (${product.name})` });
        }

        let inventory;
        if (aggregateStock) {
            const skuInventories = allInventory.filter(inv => inv.skuId === skuIdInt);
            const totalStock = skuInventories.reduce((sum, inv) => sum + Number(inv.stock), 0);
            const costPrice = skuInventories.length > 0 ? skuInventories[0].costPrice : 0;
            inventory = { stock: totalStock, costPrice: costPrice, isActive: true };
        } else {
            inventory = allInventory.find(inv => inv.skuId === skuIdInt && inv.branchId === activeBranchId);
        }

        if (!inventory || !inventory.isActive) {
            stockIssues.push({ skuId: sku.id, productName: product.name, requested: itemQty, available: 0, message: `Producto ${product.name} (${sku.code}) no está disponible en esta sucursal o no hay inventario.` });
            inventory = { stock: 0, costPrice: 0, isActive: false };
        }

        let reservedQty = 0;
        if (aggregateStock) {
            reservedQty = allReservations.filter(r => r.skuId === skuIdInt).reduce((sum, r) => sum + Number(r._sum.quantity || 0), 0);
        } else {
            reservedQty = allReservations.filter(r => r.skuId === skuIdInt && r.branchInventoryId === inventory.id).reduce((sum, r) => sum + Number(r._sum.quantity || 0), 0);
        }

        const safetyBuffer = (!isPOS && config) ? Number(config.webSafetyStock) : 0;
        const effectiveAvailableStock = Number(inventory.stock) - reservedQty - safetyBuffer;

        if (effectiveAvailableStock < itemQty) {
            stockIssues.push({ skuId: sku.id, productName: product.name, requested: itemQty, available: Math.max(0, effectiveAvailableStock), message: isPOS ? `Stock físico insuficiente para ${product.name}. Disponible: ${inventory.stock}` : `Stock insuficiente para ${product.name} (Online). Disponible para web: ${effectiveAvailableStock > 0 ? effectiveAvailableStock : 0}` });
        }

        const unitPrice = skuPrices[sku.id] || 0;
        const itemTotal = unitPrice * itemQty;
        subtotal += itemTotal;

        const pointsEnabled = activeEvent ? activeEvent.pointsEnabled : (config?.enablePoints ?? true);
        if (pointsEnabled) totalPointsEarned += (product.pointsReward || 0) * itemQty;

        let unitCostBase = 0;
        if (inventory.costPrice && Number(inventory.costPrice) > 0) {
            unitCostBase = Number(inventory.costPrice);
        } else {
            const sSku = latestSupplierSkus.get(skuIdInt);
            if (sSku) {
                const rawCost = Number(sSku.basePurchasePrice);
                const sCurrencyCode = sSku.currency || 'ARS';
                if (sCurrencyCode === baseCurrencyCode) {
                    unitCostBase = rawCost;
                } else {
                    const sCurrency = currencyMap.get(sCurrencyCode);
                    if (sCurrency) {
                        const rate = Number(sCurrency.exchangeRateToBase);
                        unitCostBase = rate > 0 ? rawCost / rate : rawCost;
                    } else {
                        unitCostBase = rawCost;
                    }
                }
            }
        }

        saleItemsData.push({
            productName: product.name,
            skuCode: sku.code,
            unitPrice: unitPrice,
            quantity: itemQty,
            subtotal: itemTotal,
            subtotalInBaseCurrency: itemTotal / exchangeRateAtPurchase,
            unitCostBase: unitCostBase,
            skuId: sku.id,
            measurementUnit: product.measurementUnit,
            variantOptions: sku.variantOptions
        });

        enrichedItems.push({ id: sku.id, quantity: itemQty, sku: { ...sku, product }, unitPrice, product });
    }

    let appliedDiscounts = [];
    let autoDiscountAmount = 0;

    if (user || enrichedItems.length > 0) {
        const discountContext = { items: enrichedItems, user, paymentType, currencyCode: activeCurrencyCode };
        const discountResult = await DiscountService.calculateDiscounts(discountContext);
        appliedDiscounts = discountResult.appliedDiscounts || [];
        autoDiscountAmount = discountResult.totalDiscountAmount || 0;
    }

    let totalDiscount = autoDiscountAmount;
    let couponDiscount = 0;
    let discountDetails = null;

    if (couponCode) {
        const couponsEnabled = activeEvent ? activeEvent.couponsEnabled : true;
        if (couponsEnabled) {
            const subtotalAfterAutoDiscounts = subtotal - autoDiscountAmount;
            if (subtotalAfterAutoDiscounts > 0) {
                const couponResult = await CouponService.validateCoupon(couponCode, subtotalAfterAutoDiscounts, activeCurrencyCode);
                couponDiscount = couponResult.discountAmount;
                totalDiscount += couponDiscount;
                discountDetails = { code: couponResult.code, type: couponResult.type, value: couponResult.value, amount: couponDiscount };
            }
        }
    }

    if (manualDiscount && manualDiscount > 0) totalDiscount += manualDiscount;

    let pointsDiscount = 0;
    let pointsUsed = 0;
    if (pointsToUse && pointsToUse > 0 && userId) {
        const availablePoints = user ? user.points : 0;
        if (pointsToUse > availablePoints) throw new Error(`No tienes suficientes puntos. Puntos disponibles: ${availablePoints}`);
        const pointsValue = config?.moneyPerPoint || 0; 
        pointsDiscount = pointsToUse * Number(pointsValue);
        totalDiscount += pointsDiscount;
        pointsUsed = pointsToUse;
    }

    totalDiscount = Math.min(totalDiscount, subtotal);
    let total = Math.max(0, subtotal - totalDiscount);

    const branchAvailability = [];
    if (!isPOS) {
        for (const branch of branches) {
            let isAvailable = true;
            let missingItems = [];
            
            for (const item of enrichedItems) {
                const skuIdInt = item.id;
                const itemQty = item.quantity;

                const inventory = allInventory.find(inv => inv.skuId === skuIdInt && inv.branchId === branch.id);

                if (!inventory) {
                    isAvailable = false;
                    missingItems.push({ productName: item.product.name, requested: itemQty, available: 0 });
                    continue;
                }

                const reservedQty = allReservations.filter(r => r.skuId === skuIdInt && r.branchInventoryId === inventory.id).reduce((sum, r) => sum + Number(r._sum.quantity || 0), 0);
                const safetyBufferLocal = config ? Number(config.webSafetyStock) : 0;
                const effectiveAvailable = Number(inventory.stock) - reservedQty - safetyBufferLocal;

                if (effectiveAvailable < itemQty) {
                    isAvailable = false;
                    missingItems.push({ productName: item.product.name, requested: itemQty, available: Math.max(0, effectiveAvailable) });
                }
            }
            branchAvailability.push({ branchId: branch.id, isAvailable, missingItems });
        }
    }

    let shippingCost = 0;
    if (deliveryType === 'DELIVERY') {
        if (address || deliveryAddress) {
            const addressObj = address || { address: deliveryAddress, city: customer?.city, state: customer?.state, zip: customer?.zipCode };
            try {
                shippingCost = await ShippingService.calculateShippingCost(addressObj, deliveryType, activeCurrencyCode, subtotal);
                if (shippingCost < 0) { 
                    shippingCost = await ShippingService.getDefaultCost();
                    if (activeCurrencyCode !== baseCurrencyCode) shippingCost = shippingCost * exchangeRateAtPurchase; 
                }
            } catch (e) {
                console.error('Error calculating shipping in preview, falling back to default:', e.message);
                shippingCost = await ShippingService.getDefaultCost();
                if (activeCurrencyCode !== baseCurrencyCode) shippingCost = shippingCost * exchangeRateAtPurchase;
            }
        } else {
            shippingCost = inputShippingCost || await ShippingService.getDefaultCost();
            if (activeCurrencyCode !== baseCurrencyCode && !inputShippingCost) shippingCost = shippingCost * exchangeRateAtPurchase;
        }
        total += shippingCost;
    } else if (deliveryType === 'PICKUP') {
        shippingCost = 0; 
    } else if (inputShippingCost !== undefined) {
        shippingCost = inputShippingCost; 
        total += shippingCost;
    }

    let tax = 0;
    const taxesEnabled = activeEvent ? (activeEvent.taxesEnabled !== false) : true;
    if (taxesEnabled && config && Number(config.taxRate) > 0) {
        tax = (subtotal - totalDiscount) * (Number(config.taxRate) / 100);
        const oldTotal = total;
        total += tax;
        console.log(`[PREVIEW_SALE] Tax Calculation: (${subtotal} - ${totalDiscount}) * ${config.taxRate}% = ${tax}. Total: ${oldTotal} -> ${total}`);
    }

    subtotal = parseFloat(subtotal.toFixed(2));
    totalDiscount = parseFloat(totalDiscount.toFixed(2));
    shippingCost = parseFloat(shippingCost.toFixed(2));
    tax = parseFloat(tax.toFixed(2));
    return {
        subtotal,
        discount: parseFloat(totalDiscount.toFixed(2)),
        pointsDiscount,
        shipping: shippingCost,
        tax,
        total,
        paymentType: paymentType || (employeeId ? 'CASH' : 'MERCADO_PAGO'),
        totalPointsEarned: parseFloat(totalPointsEarned.toFixed(2)),
        pointsUsed,
        appliedDiscounts,
        discountDetails,
        currencyCode: activeCurrencyCode,
        exchangeRateAtPurchase,
        items: saleItemsData,
        deliveryType,
        deliveryMethod,
        branchId: activeBranchId,
        aggregateStockUsed: aggregateStock,
        branchAvailability,
        stockIssues,
        warnings: [] 
    };
  }

  async createSale(userId, saleData) {
      if (userId) {
          const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
          if (user && !user.emailVerified && user.status === 'PENDING_VERIFICATION') {
              throw new Error('Debes verificar tu correo electrónico antes de realizar una compra.');
          }
      }

      const { items, couponCode, paymentType, paymentStatus, deliveryType: inputDeliveryType, deliveryMethod, deliveryAddress, customer, employeeId, manualDiscount, pointsToUse, shippingCost: inputShippingCost, branchId, currency: requestedCurrency, address } = saleData;

      // 0. Determinar Moneda y Tipo de Cambio - FIJAR MOMENTO DE COMPRA
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const baseCurrencyCode = config?.baseCurrency || 'USD';
      const activeCurrencyCode = requestedCurrency || baseCurrencyCode;
      
      const currency = await prisma.currency.findUnique({ where: { code: activeCurrencyCode } });
      if (!currency || !currency.isActive) throw new Error(`La moneda seleccionada no está activa o no fue encontrada.`);
      
      const exchangeRateAtPurchase = parseFloat(currency.exchangeRateToBase.toString());

      const deliveryType = inputDeliveryType || (deliveryMethod === 'pickup' ? 'PICKUP' : deliveryMethod === 'shipping' ? 'DELIVERY' : deliveryMethod);

      // Sucursal por defecto si no se proporciona o es inválida
      let activeBranchId = Number(branchId);
      if (!(activeBranchId > 0)) {
          const defaultBranch = await prisma.branch.findFirst({ where: { isHeadquarters: true } }) 
                         || await prisma.branch.findFirst();
          if (!defaultBranch) throw new Error('No hay sucursales configuradas en el sistema');
          activeBranchId = defaultBranch.id;
      }

      if (!items || items.length === 0) throw new Error('El carrito no puede estar vacío');

      // Determinar si es una venta POS (creada por empleado)
      const isPOS = !!employeeId;
      
      const requiresOnlinePayment = (['CARD', 'MERCADO_PAGO'].includes(paymentType) || !['CASH', 'TRANSFER', 'DEBIT', 'POINTS'].includes(paymentType)) && paymentStatus !== 'PAID';
      const reservationTTL = parseInt(process.env.STOCK_RESERVATION_TTL_MINUTES) || 30;

      const gatewaySlug = paymentType;
      const dbPaymentType = ['CASH', 'DEBIT', 'CARD', 'TRANSFER', 'MERCADO_PAGO', 'POINTS'].includes(paymentType) 
          ? paymentType 
          : 'MERCADO_PAGO';

      const transactionResult = await prisma.$transaction(async (tx) => {
        const userPendingSales = await tx.sale.findMany({
          where: { userId: parseInt(userId), paymentStatus: 'PENDING' },
          select: { id: true }
        });

        if (userPendingSales.length > 0) {
          await tx.stockReservation.updateMany({
            where: {
              released: false,
              saleId: { in: userPendingSales.map(s => s.id) }
            },
            data: { released: true }
          });
        }

        let subtotal = 0;
        let totalPointsEarned = 0; 
        const saleItemsData = [];
        const enrichedItems = []; 
        const stockValidations = [];
        const storeConfigCached = await tx.storeConfig.findFirst({ where: { id: 1 } }); 

        const aggregatedItemsMap = new Map();
        items.forEach(item => {
            if (!item.skuId) return;
            const sid = String(item.skuId);
            const qty = parseFloat((item.quantity || item.qty || 0).toString());
            aggregatedItemsMap.set(sid, (aggregatedItemsMap.get(sid) || 0) + qty);
        });
        const aggregatedItems = Array.from(aggregatedItemsMap.entries()).map(([skuId, quantity]) => ({ skuId, quantity }));

        for (const item of aggregatedItems) {
          const itemQty = parseFloat((item.quantity || item.qty || 0).toString());
          if (!itemQty || itemQty <= 0) throw new Error('Falta la cantidad del item o es inválida');
          
          if (itemQty % 1 !== 0) {
                const skuCheck = await tx.sKU.findUnique({
                    where: { id: parseInt(item.skuId) },
                    include: { product: true }
                });
                if (skuCheck?.product?.measurementUnit === 'UNIDAD') {
                    throw new Error(`Cantidad fraccionaria no permitida para venta por unidad (${skuCheck.product.name})`);
                }
          }
          
          const skuIdInt = parseInt(item.skuId);
          
          const inventoryRows = await tx.$queryRaw`
            SELECT * FROM "BranchInventory" 
          WHERE "skuId" = ${skuIdInt} AND "branchId" = ${activeBranchId} 
          FOR UPDATE
        `;
        
        let inventory = inventoryRows[0];

        if (!inventory) {
             
             await tx.$queryRaw`
                INSERT INTO "BranchInventory" ("skuId", "branchId", "stock", "isActive") 
                VALUES (${skuIdInt}, ${activeBranchId}, 0, true)
             `;
             
             const recreatedInventory = await tx.$queryRaw`
                SELECT * FROM "BranchInventory" 
                WHERE "skuId" = ${skuIdInt} AND "branchId" = ${activeBranchId} 
             `;
             inventory = recreatedInventory[0];
        }

        const skuRows = await tx.$queryRaw`
          SELECT * FROM "SKU" WHERE id = ${skuIdInt}
        `;
        const sku = skuRows[0];
        
        if (!sku) throw new Error(`SKU ${item.skuId} no encontrado`);
        
        const product = await tx.product.findUnique({
          where: { id: sku.productId }
        });
        
        if (!product) throw new Error(`Producto para SKU ${item.skuId} no encontrado`);
        if (!inventory.isActive) throw new Error(`Producto ${product.name} (${sku.code}) no está disponible en esta sucursal`);
        
        // Calcular stock reservado
        const reservedQtyResult = await tx.stockReservation.aggregate({
          where: { 
            skuId: sku.id, 
            released: false,
            expiresAt: { gt: new Date() } 
          },
          _sum: { quantity: true }
        });
        
        const reservedQty = Number(reservedQtyResult._sum.quantity || 0);
        const safetyBuffer = (!isPOS && storeConfigCached) ? Number(storeConfigCached.webSafetyStock) : 0;
        
        const effectiveAvailableStock = Number(inventory.stock) - reservedQty - safetyBuffer;
        
        
        if (effectiveAvailableStock < itemQty) {
          const errMsg = isPOS 
            ? `Stock físico insuficiente para ${product.name}. Disponible: ${inventory.stock}`
            : `Stock insuficiente para ${product.name} (Online). Disponible para web: ${effectiveAvailableStock > 0 ? effectiveAvailableStock : 0}`;
          throw new Error(errMsg);
        }

        const unitPrice = await PriceService.getSkuPrice(sku.id, activeCurrencyCode);
        const itemTotal = unitPrice * itemQty;
        subtotal += itemTotal;

        const activeEvent = await EventService.getActiveEvent();
        const pointsEnabled = activeEvent ? activeEvent.pointsEnabled : (storeConfigCached?.enablePoints ?? true);

        // Puntos ganados por este item
        if (pointsEnabled) {
            const pointsForItem = (product.pointsReward || 0) * itemQty;
            totalPointsEarned += pointsForItem;
        }

        let unitCostBase = 0;
        if (inventory.costPrice && Number(inventory.costPrice) > 0) {
             unitCostBase = Number(inventory.costPrice);
        } else {
             const supplierSkus = await tx.$queryRaw`SELECT "basePurchasePrice", "currency" FROM "SupplierSKU" WHERE "skuId" = ${skuIdInt} ORDER BY "updatedAt" DESC LIMIT 1`;
             if (supplierSkus.length > 0) {
                 const sSku = supplierSkus[0];
                 const rawCost = Number(sSku.basePurchasePrice);
                 const sCurrency = sSku.currency || 'ARS';
                 if (sCurrency === baseCurrencyCode) {
                     unitCostBase = rawCost;
                 } else {
                     const currencyRow = await tx.$queryRaw`SELECT "exchangeRateToBase" FROM "Currency" WHERE "code" = ${sCurrency}`;
                     if (currencyRow.length > 0) {
                         const rate = Number(currencyRow[0].exchangeRateToBase);
                         unitCostBase = rate > 0 ? rawCost / rate : rawCost;
                     } else {
                         unitCostBase = rawCost;
                     }
                 }
             }
        }

        saleItemsData.push({
          productName: product.name,
          skuCode: sku.code,
          unitPrice: unitPrice, 
          quantity: itemQty,
          subtotal: itemTotal,
          subtotalInBaseCurrency: itemTotal / exchangeRateAtPurchase,
          unitCostBase: unitCostBase,
          skuId: sku.id,
          measurementUnit: product.measurementUnit
        });

        enrichedItems.push({
            id: sku.id,
            quantity: itemQty,
            sku: {...sku, product}, 
            unitPrice,
            product 
        });
        
        // Guardar datos de validación para procesamiento posterior
        stockValidations.push({
          skuId: sku.id,
          branchInventoryId: inventory.id,
          quantity: itemQty,
          skuCode: sku.code,
          productName: product.name
        });
      }

      
      let shippingCost = 0;
      
      const storeConfig = storeConfigCached;
      
      if (inputShippingCost !== undefined && inputShippingCost !== null) {
           shippingCost = parseFloat(inputShippingCost);
      } else if (storeConfig && storeConfig.enableShipping && deliveryType === 'DELIVERY') {
            const addressObj = address || { address: deliveryAddress };
            try {
                shippingCost = await ShippingService.calculateShippingCost(addressObj, deliveryType, activeCurrencyCode, subtotal);
               
                if (shippingCost <= 0 && shippingCost !== 0) {
                    shippingCost = await ShippingService.getDefaultCost();
                    if (activeCurrencyCode !== baseCurrencyCode) {
                        shippingCost = shippingCost * exchangeRateAtPurchase;
                    }
                }
            } catch (e) {
                console.error('Error calculating shipping, falling back to default:', e.message);
                shippingCost = await ShippingService.getDefaultCost();
                 if (activeCurrencyCode !== baseCurrencyCode) {
                     shippingCost = shippingCost * exchangeRateAtPurchase;
                 }
            }
      }

      // 3. Usuario y Motor de Descuentos
      if (saleData.customer) {
         await tx.user.update({
             where: { id: userId },
             data: {
                 dni: saleData.customer.dni,
                 phone: saleData.customer.phone,
                 address: saleData.customer.address,
                 city: saleData.customer.city,
                 state: saleData.customer.state,
                 country: saleData.customer.country,
                 zipCode: saleData.customer.zipCode
             }
         });
      }

      const userIdInt = parseInt(userId);
      const user = await tx.user.findUnique({ where: { id: userIdInt } });
      
      if (!user) {
          throw new Error(`Usuario ID ${userIdInt} no encontrado`);
      }
      
      const discountContext = { items: enrichedItems, user, paymentType: dbPaymentType, currencyCode: activeCurrencyCode };
      const { appliedDiscounts, totalDiscountAmount } = await DiscountService.calculateDiscounts(discountContext);

      const subtotalAfterDiscounts = subtotal - totalDiscountAmount;

      let couponDiscount = 0;
      let couponId = null;

      if (couponCode) {
          const activeEvent = await EventService.getActiveEvent();
          const couponsEnabled = activeEvent ? activeEvent.couponsEnabled : true;
          
          if (!couponsEnabled) {
              throw new Error('Los cupones están desactivados durante este evento');
          }

          try {
              if (subtotalAfterDiscounts > 0) {
                  const couponResult = await CouponService.validateCoupon(couponCode, subtotalAfterDiscounts, activeCurrencyCode, userId);
                  couponDiscount = couponResult.discountAmount;
                  couponId = couponResult.id;
              }
          } catch (error) {
              throw new Error(`Error en cupón: ${error.message}`);
          }
      }

      // 5. Total Final
      let pointsDiscount = 0;
      let pointsToRedeem = Math.max(0, parseInt(pointsToUse) || 0);
      
      if (pointsToRedeem > 0) {
          if (!storeConfig || !storeConfig.enablePointsRedemption) {
              throw new Error('Canje de puntos no habilitado en la configuración');
          }
          if (!user.points || user.points < pointsToRedeem) {
              throw new Error(`Puntos insuficientes. Disponibles: ${user.points || 0}, Solicitados: ${pointsToRedeem}`);
          }
          const moneyPerPointBase = storeConfig.moneyPerPoint ? parseFloat(storeConfig.moneyPerPoint.toString()) : 0;
          const moneyPerPoint = moneyPerPointBase * exchangeRateAtPurchase;
          pointsDiscount = pointsToRedeem * moneyPerPoint;
      }

      const manualDiscountAmount = parseFloat(manualDiscount) || 0;
      let totalDiscount = totalDiscountAmount + couponDiscount + manualDiscountAmount;
      
      if (totalDiscount + pointsDiscount > subtotal) {
          totalDiscount = Math.min(totalDiscount, subtotal);
          pointsDiscount = Math.max(0, subtotal - totalDiscount);
          
          if (pointsToRedeem > 0 && storeConfig) {
              const moneyPerPointBase = storeConfig.moneyPerPoint ? parseFloat(storeConfig.moneyPerPoint.toString()) : 0;
              const moneyPerPoint = moneyPerPointBase * exchangeRateAtPurchase;
              if (moneyPerPoint > 0) {
                  pointsToRedeem = Math.ceil(pointsDiscount / moneyPerPoint);
              } else {
                  pointsToRedeem = 0;
              }
          }
      }
      
      totalDiscount = parseFloat(totalDiscount.toFixed(2));

      let tax = 0;
      const isLocal = CurrencyService.isLocalTransaction(saleData.customerIpCountry, baseCurrencyCode);
      const taxEvent = await EventService.getActiveEvent();
      const taxesEnabled = taxEvent ? (taxEvent.taxesEnabled !== false) : true;
      
      const subtotalNeto = Math.max(0, subtotal - totalDiscount - pointsDiscount);

      if (isLocal && taxesEnabled && storeConfig && Number(storeConfig.taxRate) > 0) {
          tax = subtotalNeto * (Number(storeConfig.taxRate) / 100);
      }
      
      tax = parseFloat(tax.toFixed(2));

      const finalTotal = parseFloat((subtotalNeto + shippingCost + tax).toFixed(2));

      // Conversión a moneda base para consolidación contable
      const totalInBaseCurrency = parseFloat((finalTotal / exchangeRateAtPurchase).toFixed(2));

      if (finalTotal < 0) throw new Error('El total de la venta no puede ser negativo');

      let sale;
      try {
        if (couponId && couponCode) {
            const CouponService = require('./coupon.service');
            await CouponService.incrementCouponUsage(couponId, tx);
        }
        
        sale = await tx.sale.create({
            data: {
            userId,
            subtotal: subtotal,
            discount: totalDiscount,
            taxAmount: tax,
            total: finalTotal,
            branchId: activeBranchId,
            shippingCost,
            appliedDiscounts: (appliedDiscounts && appliedDiscounts.length > 0) ? appliedDiscounts : null, 
            couponId,
            pointsUsed: pointsToRedeem,
            pointsDiscount: pointsDiscount,
            paymentType: dbPaymentType,
            paymentStatus: paymentStatus || 'PENDING',
            deliveryType,
            deliveryStatus: saleData.deliveryStatus || 'PENDING_DELIVERY',
            deliveryAddress: deliveryType === 'DELIVERY' ? deliveryAddress : null,
            observations: saleData.observations || null,
            employeeId: employeeId || null,
            currencyCode: activeCurrencyCode,
            exchangeRateAtPurchase: exchangeRateAtPurchase,
            totalInBaseCurrency: totalInBaseCurrency,
            items: {
                create: saleItemsData
            }
            },
            include: {
            items: true,
            coupon: true
            }
        });
        
        // Limpiar carrito en la DB para este usuario
        if (userId) {
            try {
                const CartService = require('./cart.service');
                await CartService.clearCart(userId);
            } catch (cartError) {
                console.error('[SaleService] Error clearing cart after sale:', cartError.message);
            }
        }
      } catch (e) {
          console.error('[SaleService] ERROR CREATING SALE:', e);
          throw e; 
      }

      // Gestión de Stock
      if (employeeId) {
          await AuditService.logAction({
              adminId: employeeId,
              action: 'CREATE_SALE_POS',
              entityType: 'SALE',
              entityId: sale.id,
              changes: { 
                  total: sale.total, 
                  paymentType: sale.paymentType, 
                  itemsCount: items.length 
              },
              ip: saleData.ip
          });
      }

      if (requiresOnlinePayment) {
      } else {
        // Venta POS / Instantánea: Deducir stock y gestionar reservas preventivas si es necesario
        for (const validation of stockValidations) {
          const updatedInventoryRows = await tx.$queryRaw`
            UPDATE "BranchInventory"
            SET stock = stock - ${validation.quantity},
              "soldQuantity" = "soldQuantity" + ${validation.quantity},
              "updatedAt" = NOW()
            WHERE id = ${validation.branchInventoryId}
            RETURNING stock
          `;
          const newStock = updatedInventoryRows[0].stock;
          
          await tx.sKU.update({
              where: { id: validation.skuId },
              data: { 
                  stock: { decrement: validation.quantity },
                  soldQuantity: { increment: validation.quantity }
              }
          });
          
          const activeReservations = await tx.stockReservation.findMany({
              where: { 
                  skuId: validation.skuId, 
                  branchInventoryId: validation.branchInventoryId, 
                  released: false,
                  expiresAt: { gt: new Date() }
              },
              orderBy: { createdAt: 'asc' }
          });
          
          const totalReserved = activeReservations.reduce((sum, res) => sum + Number(res.quantity), 0);
          
          if (newStock < totalReserved) {
              let amountToRelease = totalReserved - newStock;
              
              for (const reservation of activeReservations) {
                  if (amountToRelease <= 0) break;
                  
                  await tx.stockReservation.update({
                      where: { id: reservation.id },
                      data: { released: true }
                  });
                  amountToRelease -= Number(reservation.quantity);
              }
          }

          await tx.stockMovement.create({
              data: {
                  skuId: validation.skuId,
                  branchId: activeBranchId,
                  type: 'SALE',
                  quantity: -validation.quantity,
                  resultingStock: newStock,
                  referenceId: `SALE-${sale.id}`,
                  userId: userId,
                  notes: `Venta #${sale.id} - ${validation.productName}${isPOS ? ' [POS]' : ''}`
              }
          });

          // Notificación de Stock Bajo/Crítico en tiempo real para administradores
           const lowThreshold = storeConfig?.lowStockThreshold || 10;
           const criticalThreshold = storeConfig?.criticalStockThreshold || 5;

          if (newStock < lowThreshold) {
              const isCritical = newStock < criticalThreshold;
              InAppNotificationService.emitAdminNotification(
                  newStock <= 0 ? 'error' : isCritical ? 'error' : 'warning',
                  newStock <= 0 ? 'Stock Agotado' : isCritical ? 'Stock Crítico' : 'Stock Bajo',
                  `El producto ${validation.productName} (${validation.skuCode}) tiene stock ${newStock} en Sucursal ${activeBranchId}`,
                  { skuId: validation.skuId, stock: newStock, branchId: activeBranchId }
              );
          }
        }
      }

       // 6. Generar Recibo de Venta (Preparar numeración)
       const branch = await tx.branch.update({
           where: { id: activeBranchId },
           data: { lastTicketNumber: { increment: 1 } }
       });

       const ticketNumber = `${branch.code}-${branch.lastTicketNumber.toString().padStart(8, '0')}`;
       
       await tx.saleReceipt.create({
           data: {
               saleId: sale.id,
               branchId: activeBranchId,
               ticketNumber,
               subtotal,
               discount: totalDiscount,
               total: finalTotal,
               currencyCode: activeCurrencyCode,
               paymentType: dbPaymentType,
               issuedBy: employeeId || userId,
               status: 'ISSUED'
           }
       });

       // 7. Deducir puntos inmediatamente (Blindaje contra sobregasto / Doble Gasto)
       if (pointsToRedeem > 0) {
           const updateResult = await tx.user.updateMany({
               where: { id: userIdInt, points: { gte: pointsToRedeem } },
               data: { points: { decrement: pointsToRedeem } }
           });
           
           if (updateResult.count === 0) {
               throw new Error(`Los puntos solicitados (${pointsToRedeem}) superan tu saldo disponible actual dentro de la transacción. Operación cancelada.`);
           }

           await tx.pointsHistory.create({
               data: { 
                   userId: userIdInt, 
                   type: 'USED', 
                   amount: pointsToRedeem, 
                   reason: `Reserva orden #${sale.id}` 
               }
           });
       }

       return { sale, user, ticketNumber };
    }, {
      maxWait: 60000, 
      timeout: 60000 
    });

    
    const { sale, user, ticketNumber } = transactionResult;
    let checkoutUrl = '';

     // Notificar a Admins sobre nueva venta en tiempo real
     const localeMap = { 'ARS': 'es-AR', 'MXN': 'es-MX', 'USD': 'en-US', 'EUR': 'es-ES', 'BRL': 'pt-BR', 'CLP': 'es-CL', 'COP': 'es-CO', 'UYU': 'es-UY', 'PEN': 'es-PE', 'BOB': 'es-BO', 'PYG': 'es-PY', 'VES': 'es-VE', 'CRC': 'es-CR', 'DOP': 'es-DO', 'GTQ': 'es-GT', 'HNL': 'es-HN', 'NIO': 'es-NI', 'PAB': 'es-PA', 'CAD': 'en-CA', 'GBP': 'en-GB', 'CHF': 'de-CH' };
     const currentLocale = localeMap[activeCurrencyCode] || 'es-AR';

     InAppNotificationService.emitAdminNotification(
         'success',
         'Nueva Venta',
         `Venta #${sale.id} (${ticketNumber}) por ${new Intl.NumberFormat(currentLocale, { style: 'currency', currency: activeCurrencyCode }).format(Number(sale.total))}`,
         { saleId: sale.id, ticketNumber, total: sale.total, currency: activeCurrencyCode }
     );

    if (sale.paymentStatus !== 'PAID') {
        if (['CASH', 'TRANSFER', 'DEBIT'].includes(sale.paymentType)) {
             checkoutUrl = `/checkout/pending?saleId=${sale.id}`;
        } else {
             try {
              
                 checkoutUrl = await PaymentAdapter.createPreference(sale, user, gatewaySlug);
             } catch (error) {
                
                 console.error('[SaleService] Error creating MP preference:', error);
                 throw new Error(`Venta creada (#${ticketNumber}) pero falló inicio de pago: ${error.message}`);
             }
        }

        // Enviar mail de confirmación de pedido (Pendiente de pago)
        setImmediate(async () => {
            try {
                const NotificationService = require('./notification.service');
                const emailSubject = `Confirmación de Pedido #${sale.id} - Pendiente de Pago`;
                const emailHtml = await NotificationService.getOrderConfirmationTemplate(sale.id, sale.total, sale.paymentType);
                await NotificationService.sendEmail(user.email, emailSubject, emailHtml);
            } catch (err) {
                console.error('[SaleService] Error sending order confirmation email:', err);
            }
        });
    } else {
        // Venta ya pagada (POS): Procesar puntos y cupones inmediatamente
        setImmediate(async () => {
            try {
                await this.processPostPaymentActions(sale.id);
            } catch (error) {
                console.error('[SaleService] Error in post-payment actions for immediate sale:', error);
            }
        });
        checkoutUrl = `/checkout/success?saleId=${sale.id}`;
    }

    return { ...sale, checkoutUrl, user, ticketNumber };
  }

  async previewSale(saleData, userId) {
      const { items, paymentType = 'CARD', couponCode, manualDiscount = 0, deliveryMethod: inputDeliveryMethod, deliveryType, branchId, currency: requestedCurrency } = saleData;

      const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const activeCurrencyCode = requestedCurrency || (storeConfig?.baseCurrency || 'USD');
      const deliveryMethod = inputDeliveryMethod || (deliveryType === 'PICKUP' ? 'pickup' : deliveryType === 'DELIVERY' ? 'shipping' : deliveryType);
      let activeBranchId = Number(branchId);
      if (!(activeBranchId > 0)) {
          const defaultBranch = await prisma.branch.findFirst({ where: { isHeadquarters: true } }) 
                         || await prisma.branch.findFirst();
          if (!defaultBranch) throw new Error('No hay sucursales configuradas para previsualizar stock');
          activeBranchId = defaultBranch.id;
      }

      const user = userId ? await prisma.user.findUnique({ where: { id: parseInt(userId) }, include: { role: true } }) : null;

      if (!items || items.length === 0) return { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, hasStockError: false, stockIssues: [] };

      const skuIdsInt = items.map(item => parseInt(item.skuId)).filter(id => !isNaN(id));
      if (skuIdsInt.length === 0) return { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, hasStockError: false, stockIssues: [] };

      const t1 = Date.now();
  
      const [skus, inventories, reservations, pricesMap] = await Promise.all([
          prisma.sKU.findMany({ where: { id: { in: skuIdsInt } }, include: { product: true } }),
          prisma.branchInventory.findMany({ where: { skuId: { in: skuIdsInt }, branchId: activeBranchId } }),
          prisma.stockReservation.groupBy({
              by: ['skuId'],
              where: { skuId: { in: skuIdsInt }, released: false, expiresAt: { gt: new Date() }, NOT: { sale: { userId: userId ? parseInt(userId) : -1 } } },
              _sum: { quantity: true }
          }),
          PriceService.getMultipleSkuPrices(skuIdsInt, activeCurrencyCode)
      ]);
      const skusMap = new Map(skus.map(s => [s.id, s]));
      const invMap = new Map(inventories.map(inv => [inv.skuId, inv]));
      const resMap = new Map(reservations.map(r => [r.skuId, r._sum.quantity || 0]));

      let subtotal = 0;
      const enrichedItems = [];
      const stockIssues = [];
      let hasStockError = false;

      for (const item of items) {
          const skuIdInt = parseInt(item.skuId);
          const sku = skusMap.get(skuIdInt);
          if (!sku) continue;

          const itemQty = parseFloat((item.quantity || item.qty || 0).toString());
          const inventory = invMap.get(skuIdInt);

          if (!inventory || !inventory.isActive) {
              hasStockError = true;
              stockIssues.push({ skuId: sku.id, skuCode: sku.code, productName: sku.product.name, available: 0, requested: itemQty, reason: 'Not available in branch' });
          } else {
              const reservedQty = Number(resMap.get(skuIdInt) || 0);
              const isEmployee = user && ['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'].includes(user.role?.name);
              const safetyBuffer = (!isEmployee && storeConfig) ? Number(storeConfig.webSafetyStock) : 0;
              
              const availableForUser = isEmployee 
                ? Number(inventory.stock) 
                : Number(inventory.stock) - reservedQty - safetyBuffer;

              if (availableForUser < itemQty) {
                  hasStockError = true;
                  stockIssues.push({ 
                      skuId: sku.id, 
                      skuCode: sku.code, 
                      productName: sku.product.name, 
                      available: availableForUser < 0 ? 0 : availableForUser, 
                      requested: itemQty,
                      isSafetyBuffer: !isEmployee && (inventory.stock - reservedQty) >= itemQty 
                  });
              }

              const unitPrice = pricesMap[skuIdInt] || parseFloat(sku.price.toString());
              subtotal += unitPrice * itemQty;
              enrichedItems.push({ skuId: sku.id, id: sku.id, quantity: itemQty, sku: {...sku, product: sku.product}, unitPrice, product: sku.product, availableStock: availableForUser < 0 ? 0 : availableForUser, currencyCode: activeCurrencyCode });
          }
      }

      const currency = await prisma.currency.findUnique({ where: { code: activeCurrencyCode } });
      const rate = currency ? parseFloat(currency.exchangeRateToBase.toString()) : 1;

      const { appliedDiscounts, totalDiscountAmount } = await DiscountService.calculateDiscounts({ items: enrichedItems, user, paymentType: paymentType || 'CARD', currencyCode: activeCurrencyCode });

      let shipping = 0;
      if (storeConfig && deliveryMethod === 'shipping') {
          if (storeConfig.enableShipping) {
              const thresholdBase = storeConfig.freeShippingThreshold ? Number(storeConfig.freeShippingThreshold) : 0;
              const thresholdConverted = thresholdBase * rate;

              if (thresholdConverted > 0 && subtotal >= thresholdConverted) {
                  shipping = 0;
              } else {
                  shipping = await ShippingService.calculateShippingCost(
                      saleData.deliveryAddress || saleData.address || null,
                      deliveryMethod === 'shipping' ? 'SHIPPING' : 'LOCAL',
                      activeCurrencyCode
                  );
                  if (shipping <= 0) {
                      shipping = await ShippingService.getDefaultCost();
                      if (activeCurrencyCode !== (storeConfig?.baseCurrency || 'USD')) {
                          shipping = shipping * rate;
                      }
                  }
              }
          }
      }

      let pointsDiscount = 0;
      const pointsToRedeem = parseInt(saleData.pointsToUse) || 0;
       if (pointsToRedeem > 0 && storeConfig?.enablePointsRedemption) {
          const moneyPerPointBase = storeConfig.moneyPerPoint ? parseFloat(storeConfig.moneyPerPoint.toString()) : 0;
          pointsDiscount = pointsToRedeem * (moneyPerPointBase * rate);
      }

      const subtotalAfterDiscounts = subtotal - totalDiscountAmount;
      let discount = 0;
      let couponData = null;
      if (couponCode) {
          const activeEvent = await EventService.getActiveEvent();
          const couponsEnabled = activeEvent ? activeEvent.couponsEnabled : true;
          
          if (couponsEnabled) {
              try {
                  const couponResult = await CouponService.validateCoupon(couponCode, subtotalAfterDiscounts, activeCurrencyCode, userId);
                  if (couponResult) {
                      discount = couponResult.discountAmount;
                      couponData = { code: couponResult.code, type: couponResult.type, value: couponResult.value, amount: couponResult.discountAmount };
                  }
              } catch (e) {
                  couponData = { error: e.message };
              }
          }
      }

      let tax = 0;
      const isLocal = CurrencyService.isLocalTransaction(saleData.customerIpCountry, storeConfig?.baseCurrency);
      const previewEvent = await EventService.getActiveEvent();
      const previewTaxesEnabled = previewEvent ? (previewEvent.taxesEnabled !== false) : true;
      
      const manualDiscountAmount = parseFloat(manualDiscount) || 0;
      let totalDiscount = totalDiscountAmount + discount + manualDiscountAmount;
      
      if (totalDiscount + pointsDiscount > subtotal) {
          totalDiscount = Math.min(totalDiscount, subtotal);
          pointsDiscount = Math.max(0, subtotal - totalDiscount);
      }
      
      if (isLocal && previewTaxesEnabled && storeConfig && Number(storeConfig.taxRate) > 0) {
          tax = (subtotal - totalDiscount - pointsDiscount) * (Number(storeConfig.taxRate) / 100);
      }
      
      tax = parseFloat(tax.toFixed(2));
      const total = subtotal - totalDiscount + shipping + tax - pointsDiscount;

      return { subtotal, discount: totalDiscountAmount + discount, pointsDiscount, shipping, tax, total: total < 0 ? 0 : total, hasStockError, stockIssues, items: enrichedItems, discountDetails: couponData, appliedDiscounts, currencyCode: activeCurrencyCode };
  }

  async getSaleById(id, userId, role) {
      const saleId = parseInt(id);
      if (isNaN(saleId)) throw new Error('Venta ID inválido (debe ser un número).');
      
      const sale = await prisma.sale.findUnique({
          where: { id: saleId },
          include: { 
            items: true, 
            coupon: true, 
            currency: true,
            branch: true,
            receipt: true,
            user: { select: { name: true, email: true, dni: true, phone: true, country: true, state: true, city: true, address: true } }, 
            employee: { select: { id: true, name: true, email: true, phone: true, country: true, state: true, city: true, address: true } } 
        }
      });
      if (!sale) throw new Error('La venta solicitada no existe.');
      const roleName = typeof role === 'string' ? role : role?.name;
      if (roleName === 'CUSTOMER' && sale.userId !== userId) throw new Error('No tienes permisos para visualizar esta orden.');
      return sale;
  }

  async getAllSales(params = {}) {
      const { branchId, branchIds, paymentStatus, isAbandoned, isPendingPayment, deliveryType, paymentType, deliveryStatus } = params;
      const where = {};
      
      if (branchId) {
          where.branchId = parseInt(branchId);
      } else if (branchIds && branchIds.length > 0) {
          where.branchId = { in: branchIds.map(id => parseInt(id)) };
      }
      
      if (paymentStatus) {
          where.paymentStatus = paymentStatus;
      }

      if (deliveryType) where.deliveryType = deliveryType;
      if (paymentType) where.paymentType = paymentType;
      if (deliveryStatus) where.deliveryStatus = deliveryStatus;

      if (isAbandoned === 'true') {
          // Abandonadas Reales: PENDING y SIN mpPaymentId (nunca intentó pagar) y NO Efectivo/Transferencia
          where.paymentStatus = 'PENDING';
          where.paymentType = { notIn: ['CASH', 'TRANSFER'] };
          where.mpPaymentId = null;
      } else if (isPendingPayment === 'true') {
          // Pendientes de Pago: 
          // 1. PENDING + Efectivo/Transferencia
          // 2. PENDING + Digital (pero con mpPaymentId generado, ej Rapipago)
          where.paymentStatus = 'PENDING';
          where.OR = [
              { paymentType: { in: ['CASH', 'TRANSFER'] } },
              { mpPaymentId: { not: null } }
          ];
      } else if (params.isCancelled === 'true') {
          where.paymentStatus = { in: ['CANCELLED', 'REJECTED'] };
      } else if (isAbandoned === 'false') {
          // Confirmadas: Pagadas/Completadas
          where.paymentStatus = 'PAID';
      }

      return await prisma.sale.findMany({
          where,
          include: { 
            items: true, 
            coupon: true, 
            receipt: true, 
            user: { select: { id: true, name: true, email: true, phone: true, dni: true } }, 
            employee: { select: { id: true, name: true, email: true } } 
          },
          orderBy: { createdAt: 'desc' }
      });
  }

  /**
   * Obtiene las ventas de un usuario específico.
   * Por defecto FILTRA las ventas PENDING (abandonadas) para no ensuciar su historial.
   */
  async getUserSales(userId, includePending = true) {
      const where = { userId: parseInt(userId) };
      
      if (!includePending) {
         
          where.paymentStatus = { notIn: ['PENDING', 'CANCELLED', 'REJECTED'] };
          
      }

      return await prisma.sale.findMany({ 
          where, 
          include: { items: true, receipt: true }, 
          orderBy: { createdAt: 'desc' } 
      });
  }


  /**
   * Procesa acciones que deben ocurrir SOLO después de que una venta esté totalmente PAGADA.
   * - Otorgar Puntos
   * - Enviar correos de confirmación (opcional si no se maneja en otro lugar)
   */
  async processPostPaymentActions(saleId) {
      const sale = await prisma.sale.findUnique({
          where: { id: parseInt(saleId) },
          include: { items: { include: { sku: { include: { product: true } } } }, user: true }
      });

      if (!sale) return;
      if (sale.paymentStatus !== 'PAID') return;

      const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      
      // La deducción de cupones ahora sucede atómicamente en la creación de la venta para prevenir bypass simultáneo.

      // 3. Enviar Notificaciones y Factura
      setImmediate(async () => {
          try {
        
             await InAppNotificationService.createNotification(
                 sale.userId, 
                 'ORDER', 
                 `¡Pedido #${sale.id} Confirmado!`,
                 `Tu pago ha sido acreditado exitosamente.`,
                 { url: `/profile` }
             );

             // Enviar Correo con Factura PDF
             const NotificationService = require('./notification.service');
             const InvoiceService = require('./invoice.service');
             
             const pdfBuffer = await InvoiceService.generateInvoicePDF(sale, storeConfig);
             const storeName = storeConfig?.storeName || 'Tienda Online';
             const emailSubject = `Factura de tu Compra #${sale.id} - ${storeName}`;
             const emailHtml = `
                <div style="font-family: sans-serif; color: #374151; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">¡Tu pago ha sido confirmado!</h1>
                    </div>
                    <div style="padding: 24px;">
                        <p>Hola <strong>${sale.user?.name || sale.customerName || 'Cliente'}</strong>,</p>
                        <p>Te confirmamos que hemos recibido tu pago para la orden <strong>#${sale.id}</strong>.</p>
                        <p>Adjunto a este correo encontrarás tu <strong>factura oficial</strong> en formato PDF con todos los detalles de tu compra.</p>
                        <div style="margin: 24px 0; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                            <p style="margin: 0; font-size: 14px;"><strong>Total Pagado:</strong> ${sale.total} ${sale.currencyCode}</p>
                            <p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Método:</strong> ${sale.paymentType}</p>
                        </div>
                        <p>Estamos preparando tu pedido para que llegue a tus manos lo antes posible.</p>
                        <p>¡Gracias por elegirnos!</p>
                    </div>
                    <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
                        Este es un correo automático, por favor no lo respondas.
                    </div>
                </div>
             `;

             await NotificationService.sendEmail(
                 sale.user?.email || sale.customerEmail, 
                 emailSubject, 
                 emailHtml,
                 [{
                     filename: `factura-${sale.uuid || sale.id}.pdf`,
                     content: pdfBuffer,
                     contentType: 'application/pdf'
                 }]
             );

          } catch (e) {
             console.error(`[SaleService] Failed to send post-payment notifications: ${e.message}`);
          }
      });

      if (!storeConfig?.enablePoints) return;

      // Verificar si el evento activo permite acumular puntos
      const activeEvent = await EventService.getActiveEvent();
      const pointsEnabled = activeEvent ? activeEvent.pointsEnabled : (storeConfig.enablePoints ?? true);

      // Si el evento deshabilita puntos, no acumular nada
      if (!pointsEnabled) return;

      let totalPointsEarned = 0;
      let spendingBaseForGeneric = 0;
      
      for (const item of sale.items) {
          const pointsReward = item.sku?.product?.pointsReward || 0;
          if (pointsReward > 0) {
              totalPointsEarned += pointsReward * Number(item.quantity);
          } else {
              spendingBaseForGeneric += Number(item.subtotalInBaseCurrency || 0);
          }
      }

      const pointsPerCurrency = storeConfig.pointsPerCurrency ? Number(storeConfig.pointsPerCurrency) : 0.001;
      if (pointsPerCurrency > 0) {
          const spendingPoints = Math.floor(spendingBaseForGeneric * pointsPerCurrency);
          totalPointsEarned += spendingPoints;
      }

      if (totalPointsEarned > 0 && sale.user) {
          
           const existingHistory = await prisma.pointsHistory.findFirst({
               where: { userId: sale.userId, type: 'EARNED', reason: { contains: `#${sale.id}` } }
           });

           if (!existingHistory) {
               await prisma.$transaction([
                   prisma.user.update({
                       where: { id: sale.userId },
                       data: { points: { increment: totalPointsEarned } }
                   }),
                   prisma.pointsHistory.create({
                       data: { 
                           userId: sale.userId, 
                           type: 'EARNED', 
                           amount: totalPointsEarned, 
                           reason: `Compra #${sale.id}` 
                       }
                   })
               ]);
           }
      }
  }

  async updateSale(id, data, roleName, userId) {
      if (roleName === 'CUSTOMER') throw new Error('Los clientes no tienen permisos para editar ventas.');
      const sale = await prisma.sale.findUnique({ where: { id: parseInt(id) } });
      if (!sale) throw new Error('La venta solicitada no existe.');
      
      const { paymentStatus, paymentType, deliveryStatus, deliveryType } = data;
      const updateData = {};
      
      if (paymentStatus || paymentType) {
          if (sale.paymentStatus !== 'PENDING' && sale.paymentStatus !== 'PAID') throw new Error('Estado de pago inválido para modificar');
          if (paymentStatus) updateData.paymentStatus = paymentStatus;
          if (paymentType) {
              const pendingReservations = await prisma.stockReservation.count({
                  where: { saleId: parseInt(id), released: false }
              });
              if (pendingReservations > 0 && ['CASH', 'TRANSFER', 'DEBIT'].includes(paymentType) && !['CASH', 'TRANSFER', 'DEBIT'].includes(sale.paymentType)) {
                  throw new Error('No se puede cambiar a pago offline con reservas de stock pendientes. Cancele la venta y cree una nueva.');
              }
              updateData.paymentType = paymentType;
          }
      }
      
      if (deliveryStatus || deliveryType) {
          const validTransitions = {
              'PENDING_DELIVERY': ['SHIPPED', 'DELIVERED', 'CANCELLED'],
              'SHIPPED': ['DELIVERED', 'CANCELLED'],
              'DELIVERED': [],
              'CANCELLED': [],
              'REQUIRES_ACTION': ['PENDING_DELIVERY', 'SHIPPED', 'CANCELLED']
          };
          if (deliveryStatus) {
              const allowed = validTransitions[sale.deliveryStatus] || [];
              if (!allowed.includes(deliveryStatus)) {
                  throw new Error(`No se puede cambiar de ${sale.deliveryStatus} a ${deliveryStatus}`);
              }
              updateData.deliveryStatus = deliveryStatus;
          }
          if (deliveryType) updateData.deliveryType = deliveryType;
      }
      
      if (Object.keys(updateData).length === 0) throw new Error('No se detectaron cambios permitidos.');
      
      // Si el estado cambia a CANCELLED o REJECTED, delegar a la función especializada
      if (
          (updateData.paymentStatus === 'CANCELLED' || updateData.paymentStatus === 'REJECTED') &&
          sale.paymentStatus !== 'CANCELLED' && sale.paymentStatus !== 'REJECTED'
      ) {
          await this.cancelSale(id, userId, roleName);
          return await prisma.sale.findUnique({ where: { id: parseInt(id) } });
      }

       const updatedSale = await prisma.sale.update({ 
           where: { id: parseInt(id) }, 
           data: updateData,
           include: { items: true, stockReservations: { where: { released: false } } }
       });

       // Disparar acciones post-pago si el estado cambió a PAID
       if (updateData.paymentStatus === 'PAID' && sale.paymentStatus !== 'PAID') {
           
           if (updatedSale.stockReservations.length > 0) {
               await prisma.$transaction(async (tx) => {
                   const freshSaleRows = await tx.$queryRaw`
                       SELECT "paymentStatus" FROM "Sale" WHERE id = ${parseInt(id)} FOR UPDATE
                   `;
                   if (freshSaleRows[0]?.paymentStatus !== 'PAID') return;

                   const activeReservations = await tx.stockReservation.findMany({
                       where: { saleId: parseInt(id), released: false }
                   });

                   for (const res of activeReservations) {
                       await tx.$executeRaw`
                           UPDATE "SKU" SET stock = stock - ${res.quantity}, "soldQuantity" = "soldQuantity" + ${res.quantity}, "updatedAt" = NOW()
                           WHERE id = ${res.skuId}
                       `;
                       await tx.$executeRaw`
                           UPDATE "BranchInventory" SET stock = stock - ${res.quantity}, "soldQuantity" = "soldQuantity" + ${res.quantity}, "updatedAt" = NOW()
                           WHERE id = ${res.branchInventoryId}
                       `;
                       await tx.stockReservation.update({ where: { id: res.id }, data: { released: true } });
                       const inv = await tx.branchInventory.findUnique({ where: { id: res.branchInventoryId } });
                       await tx.stockMovement.create({
                           data: {
                               skuId: res.skuId,
                               branchId: sale.branchId,
                               type: 'SALE',
                               quantity: -Number(res.quantity),
                               resultingStock: inv ? Number(inv.stock) : 0,
                               referenceId: `SALE-${sale.id}`,
                               userId: userId,
                               notes: `Pago confirmado via updateSale - Venta #${sale.id}`
                           }
                       });
                   }
               });
           }
           await this.processPostPaymentActions(id);
       }

       return updatedSale;
  }

  /**
   * Cancela una venta y revierte todos los efectos secundarios (Stock, Cantidad Vendida).
   * ¿Solo para ventas fuera de línea o ventas online que ya fueron capturadas pero necesitan reembolso manual?
   * Por ahora, el caso de uso principal es cancelar ventas fuera de línea que reservaron stock inmediatamente.
   */
   async cancelSale(id, userId, roleName) {
       await prisma.$transaction(async (tx) => {
           const lockedRows = await tx.$queryRaw`
               SELECT * FROM "Sale" WHERE id = ${parseInt(id)} FOR UPDATE
           `;
           if (!lockedRows || lockedRows.length === 0) throw new Error('La venta a cancelar no fue encontrada.');
           const saleRow = lockedRows[0];

           if (roleName === 'CUSTOMER' && saleRow.userId !== userId) throw new Error('No tienes permiso para cancelar esta venta.');
           if (saleRow.deliveryStatus === 'DELIVERED') throw new Error('No se puede cancelar una venta ya entregada');
           if (saleRow.paymentStatus === 'PAID' && roleName === 'CUSTOMER') throw new Error('No puedes cancelar una orden que ya fue pagada. Por favor, contacta a soporte técnico.');
           if (saleRow.paymentStatus === 'CANCELLED') throw new Error('Esta venta ya fue cancelada.');

           const sale = await tx.sale.findUnique({ 
               where: { id: parseInt(id) },
               include: { items: true, stockReservations: true } 
           });
          // 1. Restaurar stock para ventas Offline (o ventas pagadas canceladas por Admin)
          if (['CASH', 'TRANSFER', 'DEBIT'].includes(sale.paymentType) || sale.paymentStatus === 'PAID') {
              for (const item of sale.items) {
                   if (item.skuId && item.quantity > 0) {
                       await tx.$executeRaw`
                           UPDATE "BranchInventory"
                           SET stock = stock + ${item.quantity},
                               "soldQuantity" = "soldQuantity" - ${item.quantity},
                               "updatedAt" = NOW()
                           WHERE "skuId" = ${item.skuId} AND "branchId" = ${sale.branchId}
                       `;
                       
                       await tx.$executeRaw`
                           UPDATE "SKU"
                           SET stock = stock + ${item.quantity},
                               "soldQuantity" = "soldQuantity" - ${item.quantity},
                               "updatedAt" = NOW()
                           WHERE id = ${item.skuId}
                       `;

                        // Obtener stock actual para el log exacto
                        const inventory = await tx.branchInventory.findUnique({
                            where: { skuId_branchId: { skuId: item.skuId, branchId: sale.branchId } }
                        });

                        await tx.stockMovement.create({
                            data: {
                                skuId: item.skuId,
                                branchId: sale.branchId,
                                type: 'MANUAL_ADJUSTMENT', 
                                quantity: Number(item.quantity), 
                                resultingStock: inventory ? Number(inventory.stock) : 0,
                                referenceId: `CANCEL-${sale.id}`,
                                userId: userId,
                                notes: `Cancelación Venta #${sale.id}`
                            }
                        });
                   }
              }
          }

          // 2. Liberar reservas (si hay pendientes)
          if (sale.stockReservations && sale.stockReservations.length > 0) {
              await tx.stockReservation.updateMany({
                  where: { saleId: sale.id, released: false },
                  data: { released: true }
              });
          }

          // 3. Actualizar estado de la venta
          await tx.sale.update({
              where: { id: sale.id },
              data: {                   paymentStatus: 'CANCELLED',
                   deliveryStatus: 'CANCELLED',
                   observations: sale.observations ? sale.observations + ' [CANCELLED]' : '[CANCELLED]'
               }
           });



           // 5. Revocar puntos ganados por la compra cancelada (si aplica)
           const earnedPointsObj = await tx.pointsHistory.findFirst({
               where: {
                   userId: sale.userId,
                   reason: `Compra #${sale.id}`,
                   type: 'EARNED'
               }
           });

           if (earnedPointsObj) {
               const alreadyRevoked = await tx.pointsHistory.findFirst({
                   where: { reason: `Revocación por Cancelación Venta #${sale.id}` }
               });
               
               if (!alreadyRevoked) {
                   await tx.user.update({
                       where: { id: sale.userId },
                       data: { points: { decrement: earnedPointsObj.amount } }
                   });
                   await tx.pointsHistory.create({
                       data: {
                           userId: sale.userId,
                           type: 'USED',
                           amount: earnedPointsObj.amount,
                           reason: `Revocación por Cancelación Venta #${sale.id}`
                       }
                   });
               }
           }

           // 5. Reembolsar puntos usados (Si corresponde)
           if (sale.pointsUsed > 0) {
               const alreadyRefunded = await tx.pointsHistory.findFirst({
                   where: { reason: `Reembolso por Cancelación Venta #${sale.id}` }
               });

               if (!alreadyRefunded) {
                   await tx.user.update({
                       where: { id: sale.userId },
                       data: { points: { increment: sale.pointsUsed } }
                   });
                   await tx.pointsHistory.create({
                       data: {
                           userId: sale.userId,
                           type: 'EARNED',
                           amount: sale.pointsUsed,
                           reason: `Reembolso por Cancelación Venta #${sale.id}`
                       }
                   });
               }
           }
           if (sale.couponId) {
               await tx.$executeRaw`
                   UPDATE "Coupon"
                   SET "usedCount" = GREATEST("usedCount" - 1, 0)
                   WHERE id = ${sale.couponId}
               `;
           }
      });

      return { success: true, message: 'Venta cancelada y stock restaurado' };
  }
  /**
   * Busca ventas PENDING con más de 1 hora de antigüedad y las marca como CANCELLED.
   * También libera las reservas de stock asociadas.
   */
  async cleanupAbandonedSales() {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneHundredNinetyTwoHoursAgo = new Date(Date.now() - 192 * 60 * 60 * 1000); // 8 dias. Para que coincida con lo estalecido en mercado Pago
      
      const abandonedSales = await prisma.sale.findMany({
          where: {
              paymentStatus: 'PENDING',
              OR: [
                  {
                      createdAt: { lt: oneHourAgo },
                      paymentTransactions: {
                          none: {}
                      }
                  },
                  {
                      createdAt: { lt: oneHundredNinetyTwoHoursAgo },
                      paymentTransactions: {
                          some: {
                              status: 'PROCESSING'
                          }
                      }
                  }
              ]
          },
          include: {
              stockReservations: { where: { released: false } }
          }
      });

      if (abandonedSales.length === 0) return 0;

      let cancelledCount = 0;

      for (const sale of abandonedSales) {
          await prisma.$transaction(async (tx) => {
              // 1. Marcar venta como CANCELADA
              await tx.sale.update({
                  where: { id: sale.id },
                  data: { 
                      paymentStatus: 'CANCELLED',
                      observations: (sale.observations || '') + '\n[Auto-Cleanup] Venta abandonada cancelada automáticamente.'
                  }
              });

               // 2. Liberar reservas de stock
               if (sale.stockReservations.length > 0) {
                   await tx.stockReservation.updateMany({
                       where: { saleId: sale.id },
                       data: { released: true }
                   });
               }

               // 3. Reembolsar puntos (Obligatorio en auto-cleanup para no robar puntos al usuario)
               if (sale.pointsUsed > 0) {
                   const alreadyRefunded = await tx.pointsHistory.findFirst({
                       where: { reason: `Reembolso automático (Venta Abandonada) #${sale.id}` }
                   });

                   if (!alreadyRefunded) {
                       await tx.user.update({
                           where: { id: sale.userId },
                           data: { points: { increment: sale.pointsUsed } }
                       });
                       await tx.pointsHistory.create({
                           data: {
                               userId: sale.userId,
                               type: 'EARNED',
                               amount: sale.pointsUsed,
                               reason: `Reembolso automático (Venta Abandonada) #${sale.id}`
                           }
                       });
                   }
               }
              // 3. Si por alguna razón la venta ya había descontado stock directamente (no vía reserva)
              // Aquí se podría implementar lógica de devolución, pero en PENDING online suele ser reserva.
          });
          cancelledCount++;
      }

      return cancelledCount;
  }
}

module.exports = new SaleService();
