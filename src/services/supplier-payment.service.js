const prisma = require('../config/prisma');

class SupplierPaymentService {
  
  async create(data, userId) {
      const { supplierId, purchaseId, amount, method, paymentDate, reference, currencyCode: requestedCurrency } = data;
      
      // 0. Determinar Moneda y Tipo de Cambio
      const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const baseCurrencyCode = storeConfig?.baseCurrency;
      if (!baseCurrencyCode) throw new Error('Store base currency not configured.');
      const activeCurrencyCode = requestedCurrency || baseCurrencyCode;
      
      const currency = await prisma.currency.findUnique({ where: { code: activeCurrencyCode } });
      if (!currency || !currency.isActive) throw new Error(`Currency ${activeCurrencyCode} is not active or not found`);
      
      const exchangeRateAtPurchase = parseFloat(currency.exchangeRateToBase.toString());
      
      return await prisma.$transaction(async (tx) => {
          // Verificar existencia de Proveedor
          const supplier = await tx.supplier.findUnique({ where: { id: parseInt(supplierId) } });
          if (!supplier) throw new Error('Proveedor no encontrado');

          // Si esta vinculado a una Compra, verificar existencia
          if (purchaseId) {
              const purchase = await tx.purchase.findUnique({ where: { id: parseInt(purchaseId) } });
              if (!purchase) throw new Error('Orden de compra no encontrada');
        
          }

          return await tx.supplierPayment.create({
              data: {
                  supplierId: parseInt(supplierId),
                  purchaseId: purchaseId ? parseInt(purchaseId) : null,
                  amount,
                  currencyCode: activeCurrencyCode,
                  exchangeRateAtPurchase,
                  amountInBaseCurrency: amount / exchangeRateAtPurchase,
                  method,
                  paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                  reference,
                  createdBy: userId
              }
          });
      });
  }

  async getAll(params = {}) {
    const { supplierId, branchId, startDate, endDate, page = 1, limit = 20, purchaseId, method, search } = params;
    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, parseInt(limit));
    const skip = (p - 1) * l;
    const where = {};
    if (supplierId) where.supplierId = parseInt(supplierId);
    if (branchId) where.branchId = parseInt(branchId);
    if (purchaseId) where.purchaseId = parseInt(purchaseId);
    if (method) where.method = method;
    if (search) {
       where.OR = [
           { reference: { contains: search, mode: 'insensitive' } },
           { supplier: { tradeName: { contains: search, mode: 'insensitive' } } }
       ];
    }
    if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) where.paymentDate.gte = new Date(startDate);
        if (endDate) where.paymentDate.lte = new Date(endDate);
    }
    const [payments, total] = await Promise.all([
        prisma.supplierPayment.findMany({
          where,
          include: {
            supplier: true,
            branch: true,
            purchase: { select: { id: true, total: true, status: true } }
          },
          orderBy: { paymentDate: 'desc' },
          skip,
          take: l
        }),
        prisma.supplierPayment.count({ where })
    ]);
    return { data: payments, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }
}

module.exports = new SupplierPaymentService();
