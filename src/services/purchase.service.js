const prisma = require('../config/prisma');
const StockMovementService = require('./stock-movement.service');
const AuditService = require('./audit.service');

class PurchaseService {
  
  async getAll(params = {}) {
     const { branchId, supplierId, status, startDate, endDate, search } = params;
     const where = {};
     
     if (branchId) where.branchId = parseInt(branchId);
     if (supplierId) where.supplierId = parseInt(supplierId);
     if (status) where.status = status;

     if (search) {
        const searchInt = parseInt(search);
        where.OR = [
            { notes: { contains: search, mode: 'insensitive' } },
            { supplier: { tradeName: { contains: search, mode: 'insensitive' } } },
            ...(!isNaN(searchInt) ? [{ id: searchInt }] : [])
        ];
     }
     
     if (startDate || endDate) {
         where.createdAt = {};
         if (startDate) where.createdAt.gte = new Date(startDate);
         if (endDate) where.createdAt.lte = new Date(endDate);
     }

     return await prisma.purchase.findMany({
         where,
         include: {
             supplier: { select: { id: true, tradeName: true } },
             branch: { select: { id: true, name: true } },
             user: { select: { id: true, name: true } },
             items: {
                 include: { sku: { include: { product: true } } }
             },
             payment: true
         },
         orderBy: { createdAt: 'desc' }
     });
  }

  async getById(id) {
      const purchaseId = parseInt(id);
      if (isNaN(purchaseId)) {
        throw new Error('ID de compra inválido');
      }

      const purchase = await prisma.purchase.findUnique({
          where: { id: purchaseId },
          include: {
             supplier: true,
             branch: true,
             user: { select: { id: true, name: true, email: true } },
             items: {
                 include: { 
                   sku: { 
                     include: { 
                       product: true,
                       variantOptions: true
                     } 
                   } 
                 }
             },
             payment: true
          }
      });
      
      if (!purchase) throw new Error('Orden de compra no encontrada');
      return purchase;
  }

  async create(data, userId) {
      const { branchId, supplierId, items, notes, deliveryDate, currencyCode: requestedCurrency } = data;
      
      // 0. Determinar Moneda y Tipo de Cambio
      const storeConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const baseCurrency = storeConfig?.baseCurrency;
    if (!baseCurrency) throw new Error('Base currency not configured in StoreConfig');
      if (!baseCurrency) throw new Error('Store base currency not configured.');
      const activeCurrencyCode = requestedCurrency || baseCurrency;
      
      const currency = await prisma.currency.findUnique({ where: { code: activeCurrencyCode } });
      if (!currency || !currency.isActive) throw new Error(`Currency ${activeCurrencyCode} is not active or not found`);
      
      const exchangeRateAtPurchase = parseFloat(currency.exchangeRateToBase.toString());
      
      // Branch por defecto si no se provee
      let activeBranchId = Number(branchId);
      if (!(activeBranchId > 0)) {
          const defaultBranch = await prisma.branch.findFirst({ where: { isHeadquarters: true } }) 
                         || await prisma.branch.findFirst();
          if (!defaultBranch) throw new Error('No hay sucursales configuradas en el sistema');
          activeBranchId = defaultBranch.id;
      }

      // Calcular total
      let estimatedTotal = 0;
      items.forEach(item => {
          estimatedTotal += (item.quantity * item.unitPrice);
      });

      const purchase = await prisma.purchase.create({
          data: {
              branchId: activeBranchId,
              supplierId: parseInt(supplierId),
              userId,
              status: 'DRAFT',
              notes,
              deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
              estimatedTotal,
              currencyCode: activeCurrencyCode,
              exchangeRateAtPurchase,
              totalInBaseCurrency: estimatedTotal / exchangeRateAtPurchase,
              items: {
                  create: items.map(item => ({
                      skuId: item.skuId,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      subtotal: item.quantity * item.unitPrice
                  }))
              }
          }
      });

      await AuditService.logAction({
          adminId: userId,
          action: 'CREATE_PURCHASE_ORDER_DRAFT',
          entityType: 'PURCHASE_ORDER',
          entityId: purchase.id,
          branchId: activeBranchId,
          changes: purchase,
          ip: data.ip
      });

      return purchase;
  }

  async confirm(id, userId) {
      // Transición: DRAFT -> CONFIRMED
      const purchase = await this.getById(id);
      if (purchase.status !== 'DRAFT') throw new Error('Solo se pueden confirmar ordenes en borrador');
      
      const result = await prisma.purchase.update({
          where: { id: parseInt(id) },
          data: { status: 'CONFIRMED' }
      });

      await AuditService.logAction({
          adminId: userId,
          action: 'CONFIRM_PURCHASE_ORDER',
          entityType: 'PURCHASE_ORDER',
          entityId: id,
          branchId: purchase.branchId,
          changes: { from: 'DRAFT', to: 'CONFIRMED' },
          ip: arguments[2]
      });

      return result;
  }

  async receive(id, userId) {
      // Transición: CONFIRMED -> RECEIVED
      return await prisma.$transaction(async (tx) => {
          const purchase = await tx.purchase.findUnique({
              where: { id: parseInt(id) },
              include: { items: true, payment: true }
          });
          
          if (!purchase) throw new Error('Orden no encontrada');
          if (purchase.status !== 'CONFIRMED' && purchase.status !== 'DRAFT') {
              throw new Error('La orden debe estar en estado BORRADOR o CONFIRMADA para ser recibida');
          }
          
          // ESTRICTO: Bloquear recepción si no está pagado
          if (!purchase.payment) {
              throw new Error('La orden debe estar PAGADA para poder recibir la mercadería');
          }
          
          for (const item of purchase.items) {
               // 1. Actualizar/Crear Inventario de Branch
               const currentInventory = await tx.branchInventory.findUnique({
                   where: { skuId_branchId: { skuId: item.skuId, branchId: purchase.branchId } }
               });
               
                let newStock = 0;
                const itemQty = parseFloat(item.quantity.toString());
                
                if (currentInventory) {
                    newStock = parseFloat(currentInventory.stock.toString()) + itemQty;
                    await tx.branchInventory.update({
                        where: { id: currentInventory.id },
                        data: { stock: { increment: itemQty } }
                    });
                } else {
                    const sku = await tx.sKU.findUnique({ where: { id: item.skuId } });
                    newStock = itemQty;
                    
                    await tx.branchInventory.create({
                        data: {
                            skuId: item.skuId,
                            branchId: purchase.branchId,
                            stock: itemQty,
                            price: sku.price,
                            costPrice: item.unitPrice
                        }
                    });
                }

                 // 2. Sincronizar Stock Global del SKU
                 await tx.sKU.update({
                     where: { id: item.skuId },
                     data: { stock: { increment: itemQty } }
                 });

                // 3. Registrar Auditoría (Movimiento de Stock)
               await StockMovementService.create(tx, {
                   skuId: item.skuId,
                   branchId: purchase.branchId,
                   type: 'PURCHASE',
                   quantity: Number(item.quantity),
                   resultingStock: newStock,
                   referenceId: `PURCHASE-${purchase.id}`,
                   userId,
                   notes: `Recepción de Orden #${purchase.id}`
               });
          }
          
          // Actualizar Estado de Compra
          const result = await tx.purchase.update({
              where: { id: purchase.id },
              data: {
                  status: 'RECEIVED',
                  receivedAt: new Date(),
                  receivedBy: userId
              }
          });

          await AuditService.logAction({
              adminId: userId,
              action: 'RECEIVE_PURCHASE_ORDER',
              entityType: 'PURCHASE_ORDER',
              entityId: purchase.id,
              branchId: purchase.branchId,
              changes: { from: purchase.status, to: 'RECEIVED' },
              ip: arguments[2]
          });

          return result;
      });
  }

  async cancel(id, userId) {
      // Transición: DRAFT | CONFIRMED -> CANCELLED
      const purchase = await this.getById(id);
      if (purchase.status === 'RECEIVED') throw new Error('No se puede cancelar una orden ya recibida');
      if (purchase.payment) throw new Error('No se puede cancelar una orden que ya tiene un pago registrado');
      
      const result = await prisma.purchase.update({
          where: { id: parseInt(id) },
          data: { status: 'CANCELLED' }
      });

      await AuditService.logAction({
          adminId: userId,
          action: 'CANCEL_PURCHASE_ORDER',
          entityType: 'PURCHASE_ORDER',
          entityId: id,
          branchId: purchase.branchId,
          changes: { from: purchase.status, to: 'CANCELLED' },
          ip: arguments[2]
      });

      return result;
  }
}

module.exports = new PurchaseService();
