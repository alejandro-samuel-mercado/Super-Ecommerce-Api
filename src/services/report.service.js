const prisma = require("../config/prisma");

class ReportService {
  /**
   * Obtiene estadísticas financieras detalladas consolidadas en la moneda base.
   * Analiza Ingresos Brutos, Netos, Costo de Mercadería (COGS) y Utilidad Bruta.
   * Separa el flujo de caja (Pagos a Proveedores) para evitar duplicidad de costos.
   */
  async getFinancialStats(params = {}) {
    const { startDate, endDate, branchId } = params;

    const start = new Date(startDate);
    const end = new Date(endDate);

    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = config?.baseCurrency;

    // Tasas de cambio actuales para fallbacks
    const currencies = await prisma.currency.findMany({
      where: { isActive: true },
    });
    const currencyMap = new Map();
    currencies.forEach((c) => {
      currencyMap.set(c.code, Number(c.exchangeRateToBase));
    });

    // 1. Obtener Ventas Pagadas en el periodo
    const saleWhere = {
      paymentStatus: "PAID",
      createdAt: { gte: start, lte: end },
    };
    if (branchId && Number(branchId) > 0) saleWhere.branchId = Number(branchId);

    const sales = await prisma.sale.findMany({
      where: saleWhere,
      include: {
        items: {
          include: {
            sku: {
              include: {
                supplierSkus: { take: 1, orderBy: { updatedAt: "desc" } },
              },
            },
            branchInventory: true,
          },
        },
      },
    });

    // 2. Obtener Pagos a Proveedores (Egresos de Caja)
    const paymentWhere = {
      paymentDate: { gte: start, lte: end },
    };
    if (branchId && Number(branchId) > 0) {
      paymentWhere.purchase = { branchId: Number(branchId) };
    }

    const payments = await prisma.supplierPayment.findMany({
      where: paymentWhere,
      select: { paymentDate: true, amount: true, amountInBaseCurrency: true },
    });

    // 2.5 Obtener Otros Gastos (Expenses)
    const expenseWhere = {
      isActive: true,
      expenseDate: { gte: start, lte: end },
    };
    if (branchId && Number(branchId) > 0) expenseWhere.branchId = Number(branchId);
    
    const expenses = await prisma.expense.findMany({
      where: expenseWhere,
      select: { expenseDate: true, amount: true, amountInBase: true },
    });

    let totalGrossRevenueBase = 0; // Total cobrado (incluye Tax/Envío) - Coincide con Dashboard
    let totalNetRevenueBase = 0; // Ingreso real del negocio (Excluye Tax/Envío)
    let totalCOGSBase = 0; // Costo de Mercadería Vendida
    const map = new Map();

    const getKey = (date) => {
      const diffDays = (end - start) / (1000 * 60 * 60 * 24);
      if (diffDays > 90) {
        return date.toLocaleString("es-ES", {
          month: "short",
          year: "numeric",
        });
      }
      return date.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
      });
    };

    // 3. Procesar Ventas
    sales.forEach((s) => {
      const key = getKey(s.createdAt);
      if (!map.has(key))
        map.set(key, {
          grossRevenue: 0,
          netRevenue: 0,
          cogs: 0,
          cashOutflow: 0,
        });
      const entry = map.get(key);

      const rateAtPurchase = Number(s.exchangeRateAtPurchase || 1);

      // Ingreso Bruto (Total de la factura convertido a Base)
      const saleGrossBase = Number(s.total) * rateAtPurchase;
      totalGrossRevenueBase += saleGrossBase;
      entry.grossRevenue += saleGrossBase;

      // Ingreso Neto (Subtotal neto de impuestos y envíos que son costos externos)
      const saleNetBase =
        (Number(s.total) -
          Number(s.taxAmount || 0) -
          Number(s.shippingCost || 0)) *
        rateAtPurchase;
      totalNetRevenueBase += saleNetBase;
      entry.netRevenue += saleNetBase;

      // COGS (Costo de Mercadería)
      s.items.forEach((item) => {
        let itemCostBase = 0;
        if (item.unitCostBase !== null && item.unitCostBase !== undefined) {
          itemCostBase = Number(item.unitCostBase);
        } else if (item.branchInventory && item.branchInventory.costPrice) {
          itemCostBase = Number(item.branchInventory.costPrice);
        } else if (
          item.sku &&
          item.sku.supplierSkus &&
          item.sku.supplierSkus.length > 0
        ) {
          const sSku = item.sku.supplierSkus[0];
          const sPrice = Number(sSku.basePurchasePrice);
          const sCurrency = sSku.currency;

          if (sCurrency === baseCurrency) {
            itemCostBase = sPrice;
          } else {
            const sRate = currencyMap.get(sCurrency) || 1;
            itemCostBase = sRate > 0 ? sPrice * sRate : sPrice;
          }
        }
        const itemTotalCost = itemCostBase * Number(item.quantity);
        totalCOGSBase += itemTotalCost;
        entry.cogs += itemTotalCost;
      });
    });

    // 4. Procesar Salidas de Caja
    let totalCashOutflowBase = 0;
    let totalOperatingExpensesBase = 0;

    payments.forEach((p) => {
      const key = getKey(p.paymentDate);
      if (!map.has(key))
        map.set(key, {
          grossRevenue: 0,
          netRevenue: 0,
          cogs: 0,
          expenses: 0,
          cashOutflow: 0,
        });
      const entry = map.get(key);

      const pBase = Number(p.amountInBaseCurrency || p.amount);
      totalCashOutflowBase += pBase;
      entry.cashOutflow += pBase;
    });

    expenses.forEach((e) => {
      const key = getKey(e.expenseDate);
      if (!map.has(key))
        map.set(key, {
          grossRevenue: 0,
          netRevenue: 0,
          cogs: 0,
          expenses: 0,
          cashOutflow: 0,
        });
      const entry = map.get(key);
      const eBase = Number(e.amountInBase || e.amount);
      totalOperatingExpensesBase += eBase;
      totalCashOutflowBase += eBase;
      entry.expenses = (entry.expenses || 0) + eBase;
      entry.cashOutflow += eBase; // Se suma al flujo de caja
    });

    // 5. Consolidar Estadísticas Finales (Contables)
    const grossProfitBase = totalNetRevenueBase - totalCOGSBase;
    const netProfitBase = grossProfitBase - totalOperatingExpensesBase;
    const netMargin =
      totalNetRevenueBase > 0
        ? (netProfitBase / totalNetRevenueBase) * 100
        : 0;

    const chartData = Array.from(map.entries()).map(([name, data]) => ({
      name,
      revenue: data.netRevenue,
      cogs: data.cogs,
      operatingExpenses: data.expenses || 0,
      profit: data.netRevenue - data.cogs - (data.expenses || 0),
      cashOutflow: data.cashOutflow,
    }));

    return {
      // Métricas de Ingresos
      totalGrossRevenue: totalGrossRevenueBase, // Lo que ve el Admin en su sumatoria total
      totalNetRevenue: totalNetRevenueBase, // Base real imponible/ganancia

      // Métricas de Costos y Utilidad
      totalCOGS: totalCOGSBase,
      totalOperatingExpenses: totalOperatingExpensesBase,
      grossProfit: grossProfitBase,
      netProfit: netProfitBase,
      netMargin,

      // Flujo de Caja
      totalCashOutflow: totalCashOutflowBase,

      chartData,
      baseCurrency,
    };
  }

  /**
   * Genera reporte de valorización de inventario actual detallado por categoría.
   */
  async getInventoryValueReport(branchId) {
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = config?.baseCurrency;

    const currencies = await prisma.currency.findMany({
      where: { isActive: true },
    });
    const currencyMap = new Map();
    currencies.forEach((c) => {
      currencyMap.set(c.code, Number(c.exchangeRateToBase));
    });

    const where = {
      isActive: true,
      stock: { gt: 0 },
    };
    if (branchId && Number(branchId) > 0) where.branchId = Number(branchId);

    const inventory = await prisma.branchInventory.findMany({
      where,
      include: {
        sku: {
          include: {
            product: { include: { category: true } },
            supplierSkus: { take: 1, orderBy: { updatedAt: "desc" } },
          },
        },
      },
    });

    let totalValueBase = 0;
    const categoryValueMap = new Map();

    inventory.forEach((item) => {
      let unitCostBase = 0;

      if (item.costPrice && Number(item.costPrice) > 0) {
        unitCostBase = Number(item.costPrice);
      } else if (
        item.sku &&
        item.sku.supplierSkus &&
        item.sku.supplierSkus.length > 0
      ) {
        const sSku = item.sku.supplierSkus[0];
        const rawCost = Number(sSku.basePurchasePrice);
        const sCurrency = sSku.currency;

        if (sCurrency === baseCurrency) {
          unitCostBase = rawCost;
        } else {
          const rate = currencyMap.get(sCurrency) || 1;
          unitCostBase = rate > 0 ? rawCost * rate : rawCost;
        }
      }

      const totalItemValue = unitCostBase * Number(item.stock);
      totalValueBase += totalItemValue;

      const catName = item.sku.product?.category?.name || "Varios";
      categoryValueMap.set(
        catName,
        (categoryValueMap.get(catName) || 0) + totalItemValue,
      );
    });

    return {
      totalValueBase,
      categoryBreakdown: Array.from(categoryValueMap.entries()).map(
        ([name, value]) => ({
          name,
          value: Number(value.toFixed(2)),
        }),
      ),
      baseCurrency,
    };
  }

  /**
   * Alias for getInventoryValueReport - matches frontend expectation
   */
  async getStockValuation(params = {}) {
    const { branchId } = params;
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    const baseCurrency = config?.baseCurrency;

    const where = {
      isActive: true,
      stock: { gt: 0 },
    };
    if (branchId && Number(branchId) > 0) where.branchId = Number(branchId);

    const inventory = await prisma.branchInventory.findMany({
      where,
      include: {
        sku: {
          include: {
            product: { include: { category: true } },
            supplierSkus: { take: 1, orderBy: { updatedAt: "desc" } },
          },
        },
      },
    });

    let totalValue = 0;
    let totalItems = 0;
    const categoryMap = new Map();
    const itemMap = new Map();

    inventory.forEach((item) => {
      const stock = Number(item.stock);
      const items = stock;
      totalItems += items;

      let unitCost = 0;
      if (item.costPrice) {
        unitCost = Number(item.costPrice);
      } else if (item.sku.supplierSkus?.length > 0) {
        const sSku = item.sku.supplierSkus[0];
        unitCost = Number(sSku.basePurchasePrice);
      }

      const totalItemValue = unitCost * stock;
      totalValue += totalItemValue;

      const catName = item.sku.product?.category?.name || "Varios";
      categoryMap.set(
        catName,
        (categoryMap.get(catName) || 0) + totalItemValue,
      );

      itemMap.set(item.sku.id, {
        name: item.sku.product.name,
        stock: stock,
        unitCost: unitCost,
        totalValue: totalItemValue,
      });
    });

    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    return {
      totalValue,
      totalItems,
      totalSkus: inventory.length,
      byCategory: Array.from(categoryMap.entries()).map(([name, value]) => ({
        name,
        value,
      })),
      topItems,
    };
  }
}

module.exports = new ReportService();
