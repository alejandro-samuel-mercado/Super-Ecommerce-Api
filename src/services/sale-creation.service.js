const prisma = require("../config/prisma");
const PriceService = require("./price.service");
const CurrencyService = require("./currency.service");
const CouponService = require("./coupon.service");
const ShippingService = require("./shipping.service");
const DiscountService = require("./discount.service");
const PaymentAdapter = require("../adapters/payment.adapter");
const InAppNotificationService = require("./in-app-notification.service");
const EventService = require("./event.service");
const AuditService = require("./audit.service");

class SaleCreationService {
    async findRecentDuplicate(userId, items, currencyCode) {
        if (!userId) return null;

        const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);

        const where = {
            userId: parseInt(userId),
            createdAt: { gt: thirtySecondsAgo },
            paymentStatus: "PENDING",
        };
        if (currencyCode) where.currencyCode = currencyCode;

        const recentSales = await prisma.sale.findMany({
            where,
            include: { items: true },
        });

        for (const sale of recentSales) {
            if (sale.items.length === items.length) {
                const allMatch = items.every((newItem) => {
                    return sale.items.some(
                        (existingItem) =>
                            existingItem.skuId === newItem.skuId &&
                            parseFloat(existingItem.quantity.toString()) ===
                            parseFloat(newItem.quantity.toString()),
                    );
                });

                if (allMatch) return sale;
            }
        }
        return null;
    }

    async createSale(userId, saleData) {
        let user = null;
        if (userId) {
            user = await prisma.user.findUnique({
                where: { id: parseInt(userId) },
            });
            if (
                user &&
                !user.emailVerified &&
                user.status === "PENDING_VERIFICATION"
            ) {
                throw new Error(
                    "Debes verificar tu correo electrónico antes de realizar una compra.",
                );
            }
        }

        const {
            items,
            couponCode,
            paymentType,
            paymentStatus,
            deliveryType: inputDeliveryType,
            deliveryMethod,
            deliveryAddress,
            customer,
            employeeId,
            manualDiscount,
            pointsToUse,
            shippingCost: inputShippingCost,
            branchId,
            currency: requestedCurrency,
            address,
        } = saleData;

        const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
        const baseCurrencyCode = config?.baseCurrency;
        if (!baseCurrencyCode)
            throw new Error(
                "No hay una moneda base configurada en los ajustes de la tienda.",
            );
        const activeCurrencyCode = requestedCurrency || baseCurrencyCode;

        const currency = await prisma.currency.findUnique({
            where: { code: activeCurrencyCode },
        });
        if (!currency || !currency.isActive)
            throw new Error(
                `La moneda seleccionada no está activa o no fue encontrada.`,
            );

        const exchangeRateAtPurchase = parseFloat(
            currency.exchangeRateToBase.toString(),
        );

        const deliveryType =
            inputDeliveryType ||
            (deliveryMethod === "pickup"
                ? "PICKUP"
                : deliveryMethod === "shipping"
                    ? "DELIVERY"
                    : deliveryMethod);

        let activeBranchId = Number(branchId);
        if (!(activeBranchId > 0)) {
            const defaultBranch =
                (await prisma.branch.findFirst({ where: { isHeadquarters: true } })) ||
                (await prisma.branch.findFirst());
            if (!defaultBranch)
                throw new Error("No hay sucursales configuradas en el sistema");
            activeBranchId = defaultBranch.id;
        }

        if (!items || items.length === 0)
            throw new Error("El carrito no puede estar vacío");

        const isPOS = !!employeeId;

        const requiresOnlinePayment = !isPOS && paymentStatus !== "PAID";
        const reservationTTL =
            parseInt(process.env.STOCK_RESERVATION_TTL_MINUTES) || 30;

        if (!user && !isPOS) {
            console.log(`[SaleService] GUEST SALE CREATION: customer email: ${customer?.email || 'MISSING'}, name: ${customer?.name || 'MISSING'}`);
        }

        const gatewaySlug = paymentType;
        let dbPaymentType = [
            "CASH",
            "DEBIT",
            "CARD",
            "TRANSFER",
            "MERCADO_PAGO",
            "POINTS",
            "QR",
        ].includes(paymentType)
            ? paymentType
            : "MERCADO_PAGO";

        if (gatewaySlug === "mercadopago_custom") {
            const isDebit = saleData.customPaymentData?.payment_method_id?.toLowerCase().includes("deb");
            dbPaymentType = isDebit ? "DEBIT" : "CARD";
        }

        const transactionResult = await prisma.$transaction(
            async (tx) => {
                const userPendingSales = await tx.sale.findMany({
                    where: { userId: parseInt(userId), paymentStatus: "PENDING" },
                    select: { id: true },
                });

                if (userPendingSales.length > 0) {
                    await tx.stockReservation.updateMany({
                        where: {
                            released: false,
                            saleId: { in: userPendingSales.map((s) => s.id) },
                        },
                        data: { released: true },
                    });
                }

                let subtotal = 0;
                let totalPointsEarned = 0;
                const saleItemsData = [];
                const enrichedItems = [];
                const stockValidations = [];
                const storeConfigCached = await tx.storeConfig.findFirst({
                    where: { id: 1 },
                });

                const aggregatedItemsMap = new Map();
                items.forEach((item) => {
                    if (!item.skuId) return;
                    const sid = String(item.skuId);
                    const qty = parseFloat((item.quantity || item.qty || 0).toString());
                    aggregatedItemsMap.set(sid, (aggregatedItemsMap.get(sid) || 0) + qty);
                });
                const aggregatedItems = Array.from(aggregatedItemsMap.entries()).map(
                    ([skuId, quantity]) => ({ skuId, quantity }),
                );

                for (const item of aggregatedItems) {
                    const itemQty = parseFloat(
                        (item.quantity || item.qty || 0).toString(),
                    );
                    if (!itemQty || itemQty <= 0)
                        throw new Error("Falta la cantidad del item o es inválida");

                    if (itemQty % 1 !== 0) {
                        const skuCheck = await tx.sKU.findUnique({
                            where: { id: parseInt(item.skuId) },
                            include: { product: true },
                        });
                        if (skuCheck?.product?.measurementUnit === "UNIDAD") {
                            throw new Error(
                                `Cantidad fraccionaria no permitida para venta por unidad (${skuCheck.product.name})`,
                            );
                        }
                    }

                    const skuIdInt = parseInt(item.skuId);

                    const inventoryRows = await tx.$queryRaw`
            SELECT * FROM "BranchInventory" 
          WHERE "skuId" = ${skuIdInt} AND "branchId" = ${activeBranchId} 
          FOR UPDATE
        `;

                    const skuRows = await tx.$queryRaw`
          SELECT * FROM "SKU" WHERE id = ${skuIdInt} AND "isDeleted" = false
        `;
                    const sku = skuRows[0];

                    if (!sku) throw new Error(`El producto o variante ya no está disponible`);

                    let inventory = inventoryRows[0];

                    if (!inventory) {
                        const now = new Date();
                        await tx.$queryRaw`
                INSERT INTO "BranchInventory" ("skuId", "branchId", "stock", "isActive", "price", "createdAt", "updatedAt") 
                VALUES (${skuIdInt}, ${activeBranchId}, 0, true, ${sku.price}, ${now}, ${now})
             `;

                        const recreatedInventory = await tx.$queryRaw`
                SELECT * FROM "BranchInventory" 
                WHERE "skuId" = ${skuIdInt} AND "branchId" = ${activeBranchId} 
             `;
                        inventory = recreatedInventory[0];
                    }

                    const product = await tx.product.findUnique({
                        where: { id: sku.productId },
                    });

                    if (!product)
                        throw new Error(`Producto para SKU ${item.skuId} no encontrado`);
                    if (product.isDeleted)
                        throw new Error(`El producto ${product.name} ya no está disponible`);
                    if (!inventory.isActive)
                        throw new Error(
                            `Producto ${product.name} (${sku.code}) no está disponible en esta sucursal`,
                        );

                    const reservedQtyResult = await tx.stockReservation.aggregate({
                        where: {
                            skuId: sku.id,
                            released: false,
                            expiresAt: { gt: new Date() },
                        },
                        _sum: { quantity: true },
                    });

                    const reservedQty = Number(reservedQtyResult._sum.quantity || 0);
                    const safetyBuffer =
                        !isPOS && storeConfigCached
                            ? Number(storeConfigCached.webSafetyStock)
                            : 0;

                    const effectiveAvailableStock =
                        Number(inventory.stock) - reservedQty - safetyBuffer;

                    if (effectiveAvailableStock < itemQty) {
                        const errMsg = isPOS
                            ? `Stock físico insuficiente para ${product.name}. Disponible: ${inventory.stock}`
                            : `Stock insuficiente en la sucursal seleccionada para ${product.name} (Online). Disponible: ${effectiveAvailableStock > 0 ? effectiveAvailableStock : 0}. Elija otra sucursal o retire en tienda`;
                        throw new Error(errMsg);
                    }

                    const unitPrice = await PriceService.getSkuPrice(
                        sku.id,
                        activeCurrencyCode,
                    );
                    const itemTotal = parseFloat((unitPrice * itemQty).toFixed(2));
                    subtotal += itemTotal;

                    const activeEvent = await EventService.getActiveEvent();
                    const pointsEnabled = activeEvent
                        ? activeEvent.pointsEnabled
                        : (storeConfigCached?.enablePoints ?? true);

                    if (pointsEnabled) {
                        const pointsForItem = (product.pointsReward || 0) * itemQty;
                        totalPointsEarned += pointsForItem;
                    }

                    let unitCostBase = 0;
                    if (inventory.costPrice && Number(inventory.costPrice) > 0) {
                        unitCostBase = Number(inventory.costPrice);
                    } else {
                        const supplierSkus =
                            await tx.$queryRaw`SELECT "basePurchasePrice", "currency" FROM "SupplierSKU" WHERE "skuId" = ${skuIdInt} ORDER BY "updatedAt" DESC LIMIT 1`;
                        if (supplierSkus.length > 0) {
                            const sSku = supplierSkus[0];
                            const rawCost = Number(sSku.basePurchasePrice);
                            const sCurrency = sSku.currency;
                            if (sCurrency === baseCurrencyCode) {
                                unitCostBase = rawCost;
                            } else {
                                const currencyRow =
                                    await tx.$queryRaw`SELECT "exchangeRateToBase" FROM "Currency" WHERE "code" = ${sCurrency}`;
                                if (currencyRow.length > 0) {
                                    const rate = Number(currencyRow[0].exchangeRateToBase);
                                    unitCostBase = rate > 0 ? rawCost * rate : rawCost;
                                } else {
                                    unitCostBase = rawCost;
                                }
                            }
                        }
                    }

                    const itemTaxRate = product.taxRate !== null ? Number(product.taxRate) : Number(storeConfigCached.taxRate);

                    saleItemsData.push({
                        productName: product.name,
                        skuCode: sku.code,
                        unitPrice: unitPrice,
                        quantity: itemQty,
                        subtotal: itemTotal,
                        subtotalInBaseCurrency: itemTotal * exchangeRateAtPurchase,
                        unitCostBase: unitCostBase,
                        skuId: sku.id,
                        measurementUnit: product.measurementUnit,
                        taxRate: itemTaxRate,
                    });

                    enrichedItems.push({
                        id: sku.id,
                        quantity: itemQty,
                        sku: { ...sku, product },
                        unitPrice,
                        product,
                    });

                    stockValidations.push({
                        skuId: sku.id,
                        branchInventoryId: inventory.id,
                        quantity: itemQty,
                        skuCode: sku.code,
                        productName: product.name,
                    });
                }

                let shippingCost = 0;

                const storeConfig = storeConfigCached;

                if (inputShippingCost !== undefined && inputShippingCost !== null) {
                    shippingCost = parseFloat(inputShippingCost);
                } else if (
                    storeConfig &&
                    storeConfig.enableShipping &&
                    deliveryType === "DELIVERY"
                ) {
                    const addressObj = address || { address: deliveryAddress };
                    try {
                        shippingCost = await ShippingService.calculateShippingCost(
                            addressObj,
                            deliveryType,
                            activeCurrencyCode,
                            subtotal,
                        );

                        if (shippingCost <= 0 && shippingCost !== 0) {
                            shippingCost = await ShippingService.getDefaultCost();
                            if (activeCurrencyCode !== baseCurrencyCode) {
                                shippingCost = parseFloat((shippingCost * exchangeRateAtPurchase).toFixed(2));
                            }
                        }
                    } catch (e) {
                        console.error(
                            "Error calculating shipping, falling back to default:",
                            e.message,
                        );
                        shippingCost = await ShippingService.getDefaultCost();
                        if (activeCurrencyCode !== baseCurrencyCode) {
                            shippingCost = parseFloat((shippingCost * exchangeRateAtPurchase).toFixed(2));
                        }
                    }
                    shippingCost = parseFloat(shippingCost.toFixed(2));
                }

                let user = null;
                if (userId) {
                    const userIdInt = parseInt(userId);
                    if (saleData.customer) {
                        await tx.user.update({
                            where: { id: userIdInt },
                            data: {
                                dni: saleData.customer.dni,
                                phone: saleData.customer.phone,
                                address: saleData.customer.address,
                                city: saleData.customer.city,
                                state: saleData.customer.state,
                                country: saleData.customer.country,
                                zipCode: saleData.customer.zipCode,
                            },
                        });
                    }
                    user = await tx.user.findUnique({ where: { id: userIdInt } });
                    if (!user) {
                        throw new Error(`Usuario ID ${userIdInt} no encontrado`);
                    }
                }

                const discountContext = {
                    items: enrichedItems,
                    user,
                    paymentType: dbPaymentType,
                    currencyCode: activeCurrencyCode,
                };
                const { appliedDiscounts, totalDiscountAmount: rawTotalDiscountAmount } =
                    await DiscountService.calculateDiscounts(discountContext);
                const totalDiscountAmount = parseFloat(rawTotalDiscountAmount.toFixed(2));

                const subtotalAfterDiscounts = subtotal - totalDiscountAmount;

                let couponDiscount = 0;
                let couponId = null;

                if (couponCode) {
                    const activeEvent = await EventService.getActiveEvent();
                    const couponsEnabled = activeEvent
                        ? activeEvent.couponsEnabled
                        : true;

                    if (!couponsEnabled) {
                        throw new Error(
                            "Los cupones están desactivados durante este evento",
                        );
                    }

                    try {
                        if (subtotalAfterDiscounts > 0) {
                            const couponResult = await CouponService.validateCoupon(
                                couponCode,
                                subtotalAfterDiscounts,
                                activeCurrencyCode,
                                userId,
                            );
                            couponDiscount = parseFloat(couponResult.discountAmount.toFixed(2));
                            couponId = couponResult.id;
                        }
                    } catch (error) {
                        throw new Error(`Error en cupón: ${error.message}`);
                    }
                }

                let pointsDiscount = 0;
                let pointsToRedeem = Math.max(0, parseInt(pointsToUse) || 0);

                if (pointsToRedeem > 0) {
                    if (!storeConfig || !storeConfig.enablePointsRedemption) {
                        throw new Error(
                            "Canje de puntos no habilitado en la configuración",
                        );
                    }
                    if (!user || user.points < pointsToRedeem) {
                        throw new Error(
                            `Puntos insuficientes. Disponibles: ${user?.points || 0}, Solicitados: ${pointsToRedeem}`,
                        );
                    }
                    const moneyPerPointBase = storeConfig.moneyPerPoint
                        ? parseFloat(storeConfig.moneyPerPoint.toString())
                        : 0;
                    const moneyPerPoint = moneyPerPointBase * exchangeRateAtPurchase;
                    pointsDiscount = parseFloat((pointsToRedeem * moneyPerPoint).toFixed(2));
                }

                const manualDiscountAmount = parseFloat(manualDiscount) || 0;
                let totalDiscount =
                    totalDiscountAmount + couponDiscount + manualDiscountAmount;

                if (totalDiscount + pointsDiscount > subtotal) {
                    totalDiscount = Math.min(totalDiscount, subtotal);
                    pointsDiscount = Math.max(0, subtotal - totalDiscount);

                    if (pointsToRedeem > 0 && storeConfig) {
                        const moneyPerPointBase = storeConfig.moneyPerPoint
                            ? parseFloat(storeConfig.moneyPerPoint.toString())
                            : 0;
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
                const isLocal = await CurrencyService.isLocalCountry(
                    saleData.customerIpCountry,
                );
                const taxEvent = await EventService.getActiveEvent();
                const taxesEnabled = taxEvent ? taxEvent.taxesEnabled !== false : true;

                const subtotalNeto = parseFloat(Math.max(
                    0,
                    subtotal - totalDiscount - pointsDiscount,
                ).toFixed(2));

                if (isLocal && taxesEnabled && storeConfig) {
                    const discountRatio = subtotal > 0 ? subtotalNeto / subtotal : 0;
                    let calculatedTax = 0;
                    saleItemsData.forEach(item => {
                        const itemFinalSubtotal = item.subtotal * discountRatio;

                        if (item.taxRate && Number(item.taxRate) > 0) {
                            calculatedTax += itemFinalSubtotal * (Number(item.taxRate) / 100);
                        } else if (storeConfigCached && Number(storeConfigCached.taxRate) > 0) {
                            calculatedTax += itemFinalSubtotal * (Number(storeConfigCached.taxRate) / 100);
                        }
                    });
                    tax = calculatedTax;
                }

                tax = parseFloat(tax.toFixed(2));

                const finalTotal = parseFloat(
                    (subtotalNeto + shippingCost + tax).toFixed(2),
                );

                const totalInBaseCurrency = parseFloat(
                    (finalTotal * exchangeRateAtPurchase).toFixed(2),
                );

                if (finalTotal < 0)
                    throw new Error("El total de la venta no puede ser negativo");

                let sale;
                try {
                    if (couponId && couponCode) {
                        const CouponService = require("./coupon.service");
                        await CouponService.incrementCouponUsage(couponId, tx);
                    }

                    sale = await tx.sale.create({
                        data: {
                            userId,
                            subtotal: subtotal,
                            discount: totalDiscount,
                            shippingCost: shippingCost,
                            total: finalTotal,
                            branchId: parseInt(activeBranchId),
                            paymentType: dbPaymentType,
                            paymentStatus: isPOS ? (paymentStatus || "PAID") : "PENDING",
                            deliveryType: deliveryType,
                            deliveryStatus: (isPOS && saleData.deliveryStatus) ? saleData.deliveryStatus : "PENDING_DELIVERY",
                            deliveryAddress: saleData.deliveryAddress || null,
                            appliedDiscounts: appliedDiscounts,
                            mpPaymentId: null,
                            observations: saleData.observations || null,
                            pointsUsed: pointsToRedeem,
                            pointsDiscount: pointsDiscount,
                            taxAmount: tax,
                            currencyCode: activeCurrencyCode,
                            exchangeRateAtPurchase: exchangeRateAtPurchase,
                            totalInBaseCurrency: totalInBaseCurrency,
                            customerName: (typeof customer === 'object' ? customer?.name : null) || saleData.customerEmail || null,
                            customerEmail: (typeof customer === 'object' ? customer?.email : null) || saleData.customerEmail || null,
                            customerPhone: (typeof customer === 'object' ? customer?.phone : null) || saleData.customerPhone || null,
                            customerDni: (typeof customer === 'object' ? customer?.dni : null) || saleData.customerDni || null,
                            customerAddress: (typeof customer === 'object' ? customer?.address : null) || saleData.customerAddress || null,
                            items: {
                                create: saleItemsData,
                            },
                        },
                        include: {
                            items: true,
                            coupon: true,
                        },
                    });

                    if (userId) {
                        try {
                            const CartService = require("./cart.service");
                            await CartService.clearCart(userId);
                        } catch (cartError) {
                            console.error(
                                "[SaleService] Error clearing cart after sale:",
                                cartError.message,
                            );
                        }
                    }
                } catch (e) {
                    console.error("[SaleService] ERROR CREATING SALE:", e);
                    throw e;
                }

                await AuditService.logAction({
                    adminId: employeeId,
                    action: "CREATE_SALE_POS",
                    entityType: "SALE",
                    entityId: sale.id,
                    branchId: sale.branchId,
                    changes: {
                        total: sale.total,
                        paymentType: sale.paymentType,
                        itemsCount: items.length,
                    },
                    ip: saleData.ip,
                });

                if (requiresOnlinePayment) {
                    const expiresAt = new Date(Date.now() + reservationTTL * 60000);
                    await tx.stockReservation.createMany({
                        data: stockValidations.map((v) => ({
                            skuId: v.skuId,
                            branchInventoryId: v.branchInventoryId,
                            saleId: sale.id,
                            quantity: v.quantity,
                            expiresAt: expiresAt,
                        })),
                    });
                } else {
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
                                soldQuantity: { increment: validation.quantity },
                            },
                        });

                        const activeReservations = await tx.stockReservation.findMany({
                            where: {
                                skuId: validation.skuId,
                                branchInventoryId: validation.branchInventoryId,
                                released: false,
                                expiresAt: { gt: new Date() },
                            },
                            orderBy: { createdAt: "asc" },
                        });

                        const totalReserved = activeReservations.reduce(
                            (sum, res) => sum + Number(res.quantity),
                            0,
                        );

                        if (newStock < totalReserved) {
                            let amountToRelease = totalReserved - newStock;

                            for (const reservation of activeReservations) {
                                if (amountToRelease <= 0) break;

                                await tx.stockReservation.update({
                                    where: { id: reservation.id },
                                    data: { released: true },
                                });
                                amountToRelease -= Number(reservation.quantity);
                            }
                        }

                        await tx.stockMovement.create({
                            data: {
                                skuId: validation.skuId,
                                branchId: activeBranchId,
                                type: "SALE",
                                quantity: -validation.quantity,
                                resultingStock: newStock,
                                referenceId: `SALE-${sale.id}`,
                                userId: userId,
                                notes: `Venta #${sale.id} - ${validation.productName}${isPOS ? " [POS]" : ""}`,
                            },
                        });

                        const lowThreshold = storeConfig?.lowStockThreshold || 10;
                        const criticalThreshold = storeConfig?.criticalStockThreshold || 5;

                        if (newStock < lowThreshold) {
                            const isCritical = newStock < criticalThreshold;
                            InAppNotificationService.emitAdminNotification(
                                newStock <= 0 ? "error" : isCritical ? "error" : "warning",
                                newStock <= 0
                                    ? "Stock Agotado"
                                    : isCritical
                                        ? "Stock Crítico"
                                        : "Stock Bajo",
                                `El producto ${validation.productName} (${validation.skuCode}) tiene stock ${newStock} en Sucursal ${activeBranchId}`,
                                {
                                    skuId: validation.skuId,
                                    stock: newStock,
                                    branchId: activeBranchId,
                                },
                            );
                        }
                    }
                }

                const branch = await tx.branch.update({
                    where: { id: activeBranchId },
                    data: { lastTicketNumber: { increment: 1 } },
                });

                const ticketNumber = `${branch.code}-${branch.lastTicketNumber.toString().padStart(8, "0")}`;

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
                        status: "ISSUED",
                    },
                });

                if (pointsToRedeem > 0 && user) {
                    const updateResult = await tx.user.updateMany({
                        where: { id: user.id, points: { gte: pointsToRedeem } },
                        data: { points: { decrement: pointsToRedeem } },
                    });

                    if (updateResult.count === 0) {
                        throw new Error(
                            `Los puntos solicitados (${pointsToRedeem}) superan tu saldo disponible actual dentro de la transacción. Operación cancelada.`,
                        );
                    }

                    await tx.pointsHistory.create({
                        data: {
                            userId: user.id,
                            type: "USED",
                            amount: pointsToRedeem,
                            reason: `Reserva orden #${sale.id}`,
                        },
                    });
                }

                return { sale, user, ticketNumber };
            },
            {
                maxWait: 60000,
                timeout: 60000,
            },
        );

        const { sale: createdSale, ticketNumber: tn } = transactionResult;
        let sale = createdSale;
        let ticketNumber = tn;
        let checkoutUrl = "";

        const localeMap = {
            ARS: "es-AR",
            MXN: "es-MX",
            USD: "en-US",
            EUR: "es-ES",
            BRL: "pt-BR",
            CLP: "es-CL",
            COP: "es-CO",
            UYU: "es-UY",
            PEN: "es-PE",
            BOB: "es-BO",
            PYG: "es-PY",
            VES: "es-VE",
            CRC: "es-CR",
            DOP: "es-DO",
            GTQ: "es-GT",
            HNL: "es-HN",
            NIO: "es-NI",
            PAB: "es-PA",
            CAD: "en-CA",
            GBP: "en-GB",
            CHF: "de-CH",
        };
        const currentLocale = localeMap[activeCurrencyCode] || "es-AR";

        InAppNotificationService.emitAdminNotification(
            "success",
            "Nueva Venta",
            `Venta #${sale.id} (${ticketNumber}) por ${new Intl.NumberFormat(currentLocale, { style: "currency", currency: activeCurrencyCode }).format(Number(sale.total))}`,
            {
                saleId: sale.id,
                ticketNumber,
                total: sale.total,
                currency: activeCurrencyCode,
            },
        );

        if (sale.paymentStatus !== "PAID") {
            if (["CASH", "CARD", "TRANSFER", "QR"].includes(sale.paymentType) || 
                (["CASH", "CARD", "TRANSFER", "DEBIT", "QR"].includes(sale.paymentType) && gatewaySlug !== 'mercadopago_custom')) {

                const referenceId = user ? sale.id : (sale.uuid || sale.id);
                checkoutUrl = `/checkout/pending?saleId=${referenceId}`;
            } else {
                try {
                    if (gatewaySlug === 'mercadopago_custom') {
                        const paymentResult = await PaymentAdapter.processPayment(
                            sale,
                            user,
                            gatewaySlug,
                            saleData.customPaymentData
                        );

                        if (paymentResult.success) {
                            console.log(`[SaleService] Payment SUCCESS for #${sale.id}. Updating status to PAID.`);
                            await prisma.sale.update({
                                where: { id: sale.id },
                                data: {
                                    paymentStatus: "PAID",
                                    mpPaymentId: paymentResult.paymentId
                                }
                            });

                            setImmediate(async () => {
                                try {
                                    const SalePaymentService = require("./sale-payment.service");
                                    await SalePaymentService.processPostPaymentActions(sale.id);
                                } catch (error) {
                                    console.error("[SaleService] Error in post-payment actions:", error);
                                }
                            });
                            checkoutUrl = `/checkout/success?saleId=${sale.id}`;
                        } else if (paymentResult.status === 'rejected') {
                            await prisma.sale.update({
                                where: { id: sale.id },
                                data: {
                                    observations: `Pago rechazado por Mercado Pago: ${paymentResult.statusDetail || 'Motivo desconocido'}`
                                }
                            });
                            checkoutUrl = `/checkout/failure?saleId=${sale.id}&status=${paymentResult.status}&detail=${paymentResult.statusDetail || ''}`;
                        } else {
                            const referenceId = user ? sale.id : (sale.uuid || sale.id);
                            checkoutUrl = `/checkout/pending?saleId=${referenceId}`;
                        }
                    } else {
                        checkoutUrl = await PaymentAdapter.createPreference(
                            sale,
                            user,
                            gatewaySlug,
                        );
                    }
                } catch (error) {
                    console.error("[SaleService] Error creating checkout preference:", error);
                    throw new Error(
                        `Venta creada (#${ticketNumber}) pero falló inicio de pago: ${error.message}`,
                    );
                }
            }

            setImmediate(async () => {
                try {
                    const NotificationService = require("./notification.service");
                    const emailSubject = `Confirmación de Pedido #${sale.id} - Pendiente de Pago`;
                    const emailHtml =
                        await NotificationService.getOrderConfirmationTemplate(
                            sale.id,
                            sale.total,
                            sale.paymentType,
                            sale.uuid,
                        );
                    await NotificationService.sendEmail(
                        user?.email || sale.customerEmail,
                        emailSubject,
                        emailHtml,
                    );
                } catch (err) {
                    console.error(
                        "[SaleService] Error sending order confirmation email:",
                        err,
                    );
                }
            });
        } else {
            setImmediate(async () => {
                try {
                    const SalePaymentService = require("./sale-payment.service");
                    await SalePaymentService.processPostPaymentActions(sale.id);
                } catch (error) {
                    console.error(
                        "[SaleService] Error in post-payment actions for immediate sale:",
                        error,
                    );
                }
            });
            checkoutUrl = `/checkout/success?saleId=${sale.id}`;
        }

        return { ...sale, checkoutUrl, user, ticketNumber };
    }
}

module.exports = new SaleCreationService();
