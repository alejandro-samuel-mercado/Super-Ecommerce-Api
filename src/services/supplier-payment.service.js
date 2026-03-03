const prisma = require('../config/prisma');

class SupplierPaymentService {
  
  async create(data, userId) {
      const { supplierId, purchaseId, amount, method, paymentDate, reference, currencyCode: requestedCurrency } = data;
      
      // 0. Determinar Moneda y Tipo de Cambio
      const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const baseCurrencyCode = storeConfig?.baseCurrency || 'USD';
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
      const { supplierId, purchaseId, startDate, endDate, method, search } = params;
      const where = {};

      if (supplierId) where.supplierId = parseInt(supplierId);
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

      return await prisma.supplierPayment.findMany({
          where,
          include: {
              supplier: { select: { id: true, tradeName: true } },
              purchase: { select: { id: true, estimatedTotal: true } },
          },
          orderBy: { paymentDate: 'desc' }
      });
  }
}

module.exports = new SupplierPaymentService();
