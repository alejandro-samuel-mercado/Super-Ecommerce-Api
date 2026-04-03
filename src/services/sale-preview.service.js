const prisma = require("../config/prisma");
const PriceService = require("./price.service");
const CurrencyService = require("./currency.service");
const ShippingService = require("./shipping.service");
const DiscountService = require("./discount.service");
const EventService = require("./event.service");

class SalePreviewService {
    async previewSale(saleData, userId) {
        const {
            items,
            paymentType = "CARD",
            couponCode,
            manualDiscount = 0,
            deliveryMethod: inputDeliveryMethod,
            deliveryType,
            branchId,
            currency: requestedCurrency,
        } = saleData;

        const storeConfig = await prisma.storeConfig.findFirst({
            where: { id: 1 },
        });
        const storeBaseCurrency = storeConfig?.baseCurrency;
        if (!storeBaseCurrency)
            throw new Error("Configuración de tienda incompleta: Falta moneda base.");
        const activeCurrencyCode = requestedCurrency || storeBaseCurrency;
        const deliveryMethod =
            inputDeliveryMethod ||
            (deliveryType === "PICKUP"
                ? "pickup"
                : deliveryType === "DELIVERY"
                    ? "shipping"
                    : "pickup");

        let activeBranchId = Number(branchId);
        if (!(activeBranchId > 0)) {
            const defaultBranch =
                (await prisma.branch.findFirst({ where: { isHeadquarters: true } })) ||
                (await prisma.branch.findFirst());
            if (defaultBranch) activeBranchId = defaultBranch.id;
        }

        if (!items || items.length === 0)
            throw new Error("El carrito está vacío");

        let user = null;
        if (userId) {
            user = await prisma.user.findUnique({
                where: { id: parseInt(userId) },
                include: { role: true },
            });
        }

        const pointsToUse = parseInt(saleData.pointsToUse) || 0;
        let pointsDiscount = 0;
        let pointsToRedeem = 0;

        if (
            pointsToUse > 0 &&
            user &&
            storeConfig?.enablePointsRedemption &&
            user.points >= pointsToUse
        ) {
            pointsToRedeem = pointsToUse;
            const moneyPerPointBase = storeConfig.moneyPerPoint
                ? parseFloat(storeConfig.moneyPerPoint.toString())
                : 0;
            const currency = await prisma.currency.findUnique({
                where: { code: activeCurrencyCode },
            });
            const rate = currency
                ? parseFloat(currency.exchangeRateToBase.toString())
                : 1;
            const moneyPerPoint = moneyPerPointBase * rate;
            pointsDiscount = parseFloat((pointsToRedeem * moneyPerPoint).toFixed(2));
        }

        const aggregatedItemsMap = new Map();
        items.forEach((item) => {
            const sid = String(item.skuId);
            const qty = parseFloat((item.quantity || item.qty || 0).toString());
            aggregatedItemsMap.set(sid, (aggregatedItemsMap.get(sid) || 0) + qty);
        });
        const aggregatedItems = Array.from(aggregatedItemsMap.entries()).map(
            ([skuId, quantity]) => ({ skuId, quantity }),
        );

        const skuIds = aggregatedItems.map((i) => parseInt(i.skuId));

        const skus = await prisma.sKU.findMany({
            where: { id: { in: skuIds } },
            include: { product: true },
        });

        const pricesMap = {};
        for (const sku of skus) {
            pricesMap[sku.id] = await PriceService.getSkuPrice(
                sku.id,
                activeCurrencyCode,
            );
        }

        let hasStockError = false;
        const stockIssues = [];
        let subtotal = 0;
        const enrichedItems = [];
        const appliedDiscounts = [];

        const allReservations = await prisma.stockReservation.groupBy({
            by: ["skuId"],
            where: {
                skuId: { in: skuIds },
                released: false,
                expiresAt: { gt: new Date() },
            },
            _sum: { quantity: true },
        });
        const resMap = new Map(
            allReservations.map((r) => [r.skuId, r._sum.quantity || 0]),
        );

        for (const item of aggregatedItems) {
            const skuIdInt = parseInt(item.skuId);
            const itemQty = parseFloat(item.quantity.toString());
            const sku = skus.find((s) => s.id === skuIdInt);
            if (!sku) {
                hasStockError = true;
                stockIssues.push({
                    skuId: skuIdInt,
                    message: "Producto no encontrado",
                });
                continue;
            }

            const inventory = await prisma.branchInventory.findUnique({
                where: {
                    skuId_branchId: {
                        skuId: skuIdInt,
                        branchId: activeBranchId,
                    },
                },
            });

            if (!inventory || !inventory.isActive) {
                const unitPrice =
                    pricesMap[skuIdInt] || parseFloat(sku.price.toString());
                subtotal += unitPrice * itemQty;
                enrichedItems.push({
                    skuId: sku.id,
                    id: sku.id,
                    quantity: itemQty,
                    sku: { ...sku, product: sku.product },
                    unitPrice,
                    product: sku.product,
                    availableStock: 0,
                    currencyCode: activeCurrencyCode,
                });
            } else {
                const reservedQty = Number(resMap.get(skuIdInt) || 0);
                const isEmployee =
                    user &&
                    ["ADMIN", "SUPER_ADMIN", "EMPLOYEE"].includes(user.role?.name);
                const safetyBuffer =
                    !isEmployee && storeConfig ? Number(storeConfig.webSafetyStock) : 0;

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
                        isSafetyBuffer:
                            !isEmployee && inventory.stock - reservedQty >= itemQty,
                    });
                }

                const unitPrice =
                    pricesMap[skuIdInt] || parseFloat(sku.price.toString());
                subtotal += unitPrice * itemQty;
                enrichedItems.push({
                    skuId: sku.id,
                    id: sku.id,
                    quantity: itemQty,
                    sku: { ...sku, product: sku.product },
                    unitPrice,
                    product: sku.product,
                    availableStock: availableForUser < 0 ? 0 : availableForUser,
                    currencyCode: activeCurrencyCode,
                });
            }
        }

        const currency = await prisma.currency.findUnique({
            where: { code: activeCurrencyCode },
        });
        const rate = currency
            ? parseFloat(currency.exchangeRateToBase.toString())
            : 1;

        let totalPointsEarned = 0;
        const activeEventForPoints = await EventService.getActiveEvent();
        const pointsEnabled = activeEventForPoints
            ? activeEventForPoints.pointsEnabled
            : (storeConfig?.enablePoints ?? true);
        if (pointsEnabled && user) {
            let spendingBaseForGeneric = 0;
            for (const ei of enrichedItems) {
                const pointsReward = ei.product?.pointsReward || 0;
                if (pointsReward > 0) {
                    totalPointsEarned += pointsReward * ei.quantity;
                } else {
                    const itemBase = ei.unitPrice * ei.quantity * rate;
                    spendingBaseForGeneric += itemBase;
                }
            }
            const pointsPerCurrency = storeConfig?.pointsPerCurrency
                ? Number(storeConfig.pointsPerCurrency)
                : 0.001;
            if (pointsPerCurrency > 0) {
                totalPointsEarned += Math.floor(
                    spendingBaseForGeneric * pointsPerCurrency,
                );
            }
        }

        let shipping = 0;
        if (
            storeConfig?.enableShipping &&
            deliveryMethod === "shipping"
        ) {
            try {
                shipping = await ShippingService.calculateShippingCost(
                    saleData.address || {},
                    deliveryMethod,
                    activeCurrencyCode,
                    subtotal,
                );
                if (shipping <= 0 && shipping !== 0) {
                    shipping = await ShippingService.getDefaultCost();
                    if (activeCurrencyCode !== storeBaseCurrency) {
                        shipping = parseFloat((shipping * rate).toFixed(2));
                    }
                }
            } catch (e) {
                shipping = await ShippingService.getDefaultCost();
                if (activeCurrencyCode !== storeBaseCurrency) {
                    shipping = parseFloat((shipping * rate).toFixed(2));
                }
            }
        }

        const discountContext = {
            items: enrichedItems,
            user,
            paymentType,
            currencyCode: activeCurrencyCode,
        };
        const { appliedDiscounts: discountResults, totalDiscountAmount } =
            await DiscountService.calculateDiscounts(discountContext);
        appliedDiscounts.push(...discountResults);

        let discount = 0;
        let couponData = null;

        if (couponCode) {
            const activeEvent = await EventService.getActiveEvent();
            const couponsEnabled = activeEvent ? activeEvent.couponsEnabled : true;

            if (couponsEnabled) {
                try {
                    const CouponService = require("./coupon.service");
                    const couponResult = await CouponService.validateCoupon(
                        couponCode,
                        subtotal - totalDiscountAmount,
                        activeCurrencyCode,
                        userId,
                    );
                    if (couponResult) {
                        discount = parseFloat(couponResult.discountAmount.toFixed(2));
                        couponData = {
                            code: couponResult.code,
                            type: couponResult.type,
                            value: couponResult.value,
                            amount: couponResult.discountAmount,
                        };
                    }
                } catch (e) {
                    couponData = { error: e.message };
                }
            }
        }

        let tax = 0;
        const isLocal = await CurrencyService.isLocalCountry(
            saleData.customerIpCountry,
        );
        const previewEvent = await EventService.getActiveEvent();
        const previewTaxesEnabled = previewEvent
            ? previewEvent.taxesEnabled !== false
            : true;

        const manualDiscountAmount = parseFloat(manualDiscount) || 0;
        let totalDiscount = totalDiscountAmount + discount + manualDiscountAmount;

        if (totalDiscount + pointsDiscount > subtotal) {
            totalDiscount = Math.min(totalDiscount, subtotal);
            pointsDiscount = parseFloat(Math.max(0, subtotal - totalDiscount).toFixed(2));
        }

        if (isLocal && previewTaxesEnabled && storeConfig) {
            const taxableBase = Math.max(0, subtotal - totalDiscount - pointsDiscount);
            const discountRatio = subtotal > 0 ? taxableBase / subtotal : 0;
            const globalTaxRate = Number(storeConfig.taxRate) || 0;

            let calculatedTax = 0;
            for (const ei of enrichedItems) {
                const itemTaxRate = ei.product?.taxRate !== null && ei.product?.taxRate !== undefined
                    ? parseFloat(ei.product.taxRate.toString())
                    : 0;

                const itemGross = ei.unitPrice * ei.quantity;
                const itemTaxable = itemGross * discountRatio;

                if (itemTaxRate > 0) {
                    calculatedTax += itemTaxable * (itemTaxRate / 100);
                } else if (globalTaxRate > 0) {
                    calculatedTax += itemTaxable * (globalTaxRate / 100);
                }
            }
            tax = calculatedTax;
        }

        tax = parseFloat(tax.toFixed(2));
        const total = subtotal - totalDiscount + shipping + tax - pointsDiscount;

        return {
            subtotal,
            discount: totalDiscountAmount + discount,
            pointsDiscount,
            shipping,
            tax,
            total: total < 0 ? 0 : total,
            hasStockError,
            stockIssues,
            items: enrichedItems,
            discountDetails: couponData,
            appliedDiscounts,
            totalPointsEarned,
            freeShippingThreshold: storeConfig?.freeShippingThreshold
                ? Number(storeConfig.freeShippingThreshold) * rate
                : 0,
            currencyCode: activeCurrencyCode,
        };
    }
}

module.exports = new SalePreviewService();
