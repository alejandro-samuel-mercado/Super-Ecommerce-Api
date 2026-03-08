const prisma = require('../config/prisma');

class ReportService {
  
  /**
   * Obtener Estadísticas Financieras (Ingresos vs Gastos)
   * @param {object} params { startDate, endDate, branchId, timeRange }
   */
  async getFinancialStats(params = {}) {
    const { startDate, endDate, branchId, timeRange } = params;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // 1. INGRESOS (Ventas)
    const saleWhere = {
        paymentStatus: 'PAID',
        createdAt: { gte: start, lte: end }
    };
    if (branchId && Number(branchId) > 0) saleWhere.branchId = Number(branchId);

    const revenueAgg = await prisma.sale.aggregate({
        _sum: { 
            total: true,
            totalInBaseCurrency: true,
            taxAmount: true,
            shippingCost: true
        },
        where: saleWhere
    });
    
    // Revenue Neto = Total - Impuestos - Envío
    const sumGross = Number(revenueAgg._sum.total || 0);
    const sumTax = Number(revenueAgg._sum.taxAmount || 0);
    const sumShip = Number(revenueAgg._sum.shippingCost || 0);
    const totalRevenue = sumGross - sumTax - sumShip;

    const ratio = sumGross > 0 ? totalRevenue / sumGross : 1;
    const totalRevenueBase = Number(revenueAgg._sum.totalInBaseCurrency || 0) * ratio;

    // 2. GASTOS (Pagos a Proveedores)
    // Solo contamos pagos vinculados a compras para filtrado de sucursal específica
    // Si branchId es nulo (Global), contamos TODOS los pagos.
    
    const paymentWhere = {
        paymentDate: { gte: start, lte: end }
    };

    if (branchId) {
        const sid = Number(branchId);
        if (sid > 0) paymentWhere.purchase = { branchId: sid };
    }

    const expenseAgg = await prisma.supplierPayment.aggregate({
        _sum: { 
            amount: true,
            amountInBaseCurrency: true
        },
        where: paymentWhere
    });
    const totalExpenses = Number(expenseAgg._sum.amount || 0);
    const totalExpensesBase = Number(expenseAgg._sum.amountInBaseCurrency || 0);

    const sales = await prisma.sale.findMany({
        where: saleWhere,
        select: { 
            createdAt: true, 
            total: true, 
            totalInBaseCurrency: true,
            taxAmount: true,
            shippingCost: true,
            items: {
                include: {
                    sku: {
                        include: {
                            supplierSkus: { take: 1, orderBy: { updatedAt: 'desc' } }
                        }
                    },
                    branchInventory: true
                }
            }
        }
    });

    const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = storeConfig?.baseCurrency;
    if (!baseCurrency) throw new Error('Base currency not configured in StoreConfig');
    const currencies = await prisma.currency.findMany();

    let totalCostBase = 0;
    sales.forEach(s => {
        s.items.forEach(item => {
            let cost = 0;
            if (item.unitCostBase !== null && item.unitCostBase !== undefined) {
                cost = Number(item.unitCostBase);
            } else if (item.branchInventory && item.branchInventory.costPrice) {
                cost = Number(item.branchInventory.costPrice);
            } else if (item.sku && item.sku.supplierSkus && item.sku.supplierSkus.length > 0) {
                cost = Number(item.sku.supplierSkus[0].basePurchasePrice);
            }
            totalCostBase += cost * Number(item.quantity);
        });
    });

    const payments = await prisma.supplierPayment.findMany({
        where: paymentWhere,
        select: { paymentDate: true, amount: true, amountInBaseCurrency: true }
    });

    const netProfit = totalRevenueBase - totalCostBase - totalExpensesBase;

    const map = new Map();

    const getKey = (date) => {
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        if (diffDays > 90) {
            return date.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
        }
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    };

    sales.forEach(s => {
        const key = getKey(s.createdAt);
        if (!map.has(key)) map.set(key, { revenueBase: 0, costOfGoods: 0, supplierPayments: 0 });
        const entry = map.get(key);
        
        const saleGross = Number(s.total);
        const saleNet = saleGross - Number(s.taxAmount || 0) - Number(s.shippingCost || 0);

        const saleRatio = saleGross > 0 ? saleNet / saleGross : 1;
        entry.revenueBase += Number(s.totalInBaseCurrency || s.total) * saleRatio;
        
        s.items.forEach(item => {
            let cost = 0;
            if (item.unitCostBase !== null && item.unitCostBase !== undefined) {
                cost = Number(item.unitCostBase);
            } else if (item.branchInventory && item.branchInventory.costPrice) {
                cost = Number(item.branchInventory.costPrice);
            } else if (item.sku && item.sku.supplierSkus && item.sku.supplierSkus.length > 0) {
                cost = Number(item.sku.supplierSkus[0].basePurchasePrice);
            }
            entry.costOfGoods += cost * Number(item.quantity);
        });
    });

    payments.forEach(p => {
        const key = getKey(p.paymentDate);
        if (!map.has(key)) map.set(key, { revenueBase: 0, costOfGoods: 0, supplierPayments: 0 });
        const entry = map.get(key);
        entry.supplierPayments += Number(p.amount);
    });

    const chartData = Array.from(map.entries()).map(([name, data]) => ({
        name,
        revenue: data.revenueBase,
        expenses: data.costOfGoods + data.supplierPayments,
        profit: data.revenueBase - data.costOfGoods - data.supplierPayments
    }));


    
    return {
        totalRevenue,
        totalRevenueBase,
        totalExpenses,
        totalExpensesBase,
        netProfit,
        margin: totalRevenueBase > 0 ? (netProfit / totalRevenueBase) * 100 : 0,
        chartData
    };
  }

  /**
   * Obtener Valoración de Stock
   * @param {object} params { branchId }
   */
  async getStockValuation(params = {}) {
    const { branchId } = params;
    const where = {};
    if (branchId && Number(branchId) > 0) where.branchId = Number(branchId);
    where.stock = { gt: 0 };

    const currencies = await prisma.currency.findMany();
    const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = storeConfig?.baseCurrency;
    if (!baseCurrency) throw new Error('Base currency not configured in StoreConfig');

    const inventory = await prisma.branchInventory.findMany({
        where,
        include: {
            sku: {
                include: {
                    product: { select: { name: true, category: { select: { name: true } } } },
                    supplierSkus: { take: 1, orderBy: { updatedAt: 'desc' } }
                }
            },
            branch: { select: { name: true } }
        }
    });

    let totalValue = 0;
    let totalItems = 0;
    const byCategory = {};

    inventory.forEach(item => {
        // Determinar Costo
        // 1. item.costPrice (Sobrescritura específica de Sucursal)
        // 2. item.sku.supplierSkus[0].basePurchasePrice (Precio del Proveedor)
        // 3. item.sku.price * 0.6 (Estimación de fallback, 60% del minorista)
        
        let cost = 0;
        if (item.costPrice) {
            cost = Number(item.costPrice);
         
        } else if (item.sku.supplierSkus && item.sku.supplierSkus.length > 0) {
            cost = Number(item.sku.supplierSkus[0].basePurchasePrice);
        } else {
            cost = 0;
        }

        const stockNum = Number(item.stock);
        const value = stockNum * cost;
        totalValue += value;
        totalItems += stockNum;

        // Agrupar por Categoría
        const catName = item.sku.product.category.name;
        if (!byCategory[catName]) byCategory[catName] = 0;
        byCategory[catName] += value;
    });

    // Formatear datos de categoría
    const categoryData = Object.keys(byCategory).map(name => ({
        name,
        value: byCategory[name]
    })).sort((a, b) => b.value - a.value);

    return {
        totalValue,
        totalItems,
        totalSkus: inventory.length,
        byCategory: categoryData,
        // Top 5 Artículos más Valiosos
        topItems: inventory
            .map(item => {
                let unitCost = 0;
                if (item.costPrice) {
                    unitCost = Number(item.costPrice);
                } else if (item.sku.supplierSkus && item.sku.supplierSkus.length > 0) {
                    unitCost = Number(item.sku.supplierSkus[0].basePurchasePrice);
                }
                
                return {
                    name: item.sku.product.name,
                    stock: item.stock,
                    unitCost: unitCost,
                    totalValue: item.stock * unitCost
                };
            })
            .sort((a, b) => b.totalValue - a.totalValue)
            .slice(0, 5)
    };
  }
}

module.exports = new ReportService();
