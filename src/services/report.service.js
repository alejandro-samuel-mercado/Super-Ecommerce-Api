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
            totalInBaseCurrency: true 
        },
        where: saleWhere
    });
    const totalRevenue = Number(revenueAgg._sum.total || 0);
    const totalRevenueBase = Number(revenueAgg._sum.totalInBaseCurrency || 0);

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

    // 3. BENEFICIO
    const netProfit = totalRevenueBase - totalExpensesBase;

    // 4. DATOS DEL GRÁFICO (Agrupados por Día o Mes)
    // Construir datos granulares para el gráfico
    // Necesitamos obtener datos crudos y agregar en JS para flexibilidad
    
    const sales = await prisma.sale.findMany({
        where: saleWhere,
        select: { createdAt: true, total: true, totalInBaseCurrency: true }
    });

    const payments = await prisma.supplierPayment.findMany({
        where: paymentWhere,
        select: { paymentDate: true, amount: true, amountInBaseCurrency: true }
    });

    // Agrupar (Bucketize)
    const map = new Map();

    const getKey = (date) => {
        // Si el rango es > 90 días, agrupar por mes. Sino por día.
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        if (diffDays > 90) {
            return date.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
        }
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    };

    sales.forEach(s => {
        const key = getKey(s.createdAt);
        if (!map.has(key)) map.set(key, { revenue: 0, revenueBase: 0, expenses: 0, profit: 0 });
        const entry = map.get(key);
        entry.revenue += Number(s.total);
        entry.revenueBase += Number(s.totalInBaseCurrency || s.total);
    });

    payments.forEach(p => {
        const key = getKey(p.paymentDate);
        if (!map.has(key)) map.set(key, { revenue: 0, revenueBase: 0, expenses: 0, expensesBase: 0, profit: 0 });
        const entry = map.get(key);
        entry.expenses += Number(p.amount);
        entry.expensesBase += Number(p.amountInBaseCurrency || p.amount);
    });

    // Calcular beneficio por grupo y formato
    const chartData = Array.from(map.entries()).map(([name, data]) => ({
        name,
        revenue: data.revenueBase,
        expenses: data.expensesBase,
        profit: data.revenueBase - data.expensesBase
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
    const baseCurrency = storeConfig?.baseCurrency || 'USD';

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
            const sSku = item.sku.supplierSkus[0];
            const rawCost = Number(sSku.basePurchasePrice);
            const sCurrency = sSku.currency || 'ARS';
            
            if (sCurrency === baseCurrency) {
                cost = rawCost;
            } else {
                // Convertir a moneda base
                const currencyInfo = currencies.find(c => c.code === sCurrency);
                const rate = currencyInfo ? Number(currencyInfo.exchangeRateToBase) : 1;
                // exchangeRateToBase es (Objetivo / Base). 
                // Para obtener Base desde Objetivo: valorObjetivo / tasa
                cost = rawCost / rate;
            }
        } else {
            cost = 0;
        }

        const value = item.stock * cost;
        totalValue += value;
        totalItems += item.stock;

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
                    const sSku = item.sku.supplierSkus[0];
                    const rawCost = Number(sSku.basePurchasePrice);
                    const sCurrency = sSku.currency || 'ARS';
                    
                    if (sCurrency === baseCurrency) {
                        unitCost = rawCost;
                    } else {
                        const currencyInfo = currencies.find(c => c.code === sCurrency);
                        const rate = currencyInfo ? Number(currencyInfo.exchangeRateToBase) : 1;
                        unitCost = rawCost / rate;
                    }
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
