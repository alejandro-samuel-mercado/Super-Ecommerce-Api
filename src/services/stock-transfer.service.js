const prisma = require('../config/prisma');
const AuditService = require('./audit.service');

class StockTransferService {

  async getAll(params = {}) {
    const { branchId, status, startDate, endDate } = params;
    const where = {};

    if (branchId) {
      where.OR = [
        { originBranchId: parseInt(branchId) },
        { destinationBranchId: parseInt(branchId) }
      ];
    }

    if (status) where.status = status;
    
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    return await prisma.stockTransfer.findMany({
      where,
      include: {
        originBranch: { select: { id: true, name: true } },
        destinationBranch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        items: {
          include: {
            sku: {
                include: { product: { select: { name: true, images: true } } }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getById(id) {
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: parseInt(id) },
      include: {
        originBranch: true,
        destinationBranch: true,
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            sku: {
                include: { product: true }
            }
          }
        }
      }
    });

    if (!transfer) throw new Error('Transferencia no encontrada');
    return transfer;
  }

  async createRequest(data, userId) {
    const { originBranchId, destinationBranchId, items, notes } = data;

    if (originBranchId === destinationBranchId) {
      throw new Error('El origen y destino no pueden ser iguales');
    }

   
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: true, adminBranches: true }
    });

    if (user.role.name !== 'SUPER_ADMIN') {
        const userBranchIds = user.adminBranches.map(s => s.branchId);
     
        if (user.branchId) userBranchIds.push(user.branchId);
        
        const hasOrigin = userBranchIds.includes(parseInt(originBranchId));

        if (!hasOrigin) {
            throw new Error('No tienes permisos en la sucursal de origen para realizar esta transferencia');
        }
    }

    return await prisma.$transaction(async (tx) => {
      for (const item of items) {
         const originStock = await tx.branchInventory.findUnique({
             where: { skuId_branchId: { skuId: item.skuId, branchId: originBranchId } }
         });
         if (!originStock || Number(originStock.stock) < Number(item.quantity)) {
             throw new Error(`Stock insuficiente en origen para SKU ID ${item.skuId}`);
         }
      }

      const transfer = await tx.stockTransfer.create({
        data: {
          originBranchId,
          destinationBranchId,
          userId,
          status: 'PENDING',
          notes,
          items: {
            create: items.map(item => ({
              skuId: item.skuId,
              quantity: item.quantity
            }))
          }
        },
        include: { items: true }
      });

      await AuditService.logAction({
        adminId: userId,
        action: 'CREATE_STOCK_TRANSFER_REQUEST',
        entityType: 'STOCK_TRANSFER',
        entityId: transfer.id,
        branchId: originBranchId,
        changes: transfer,
        ip: data.ip
      });

      return transfer;
    }, { maxWait: 20000, timeout: 20000 });
  }

  async shipTransfer(id, userId) {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT * FROM "StockTransfer" WHERE id = ${parseInt(id)} FOR UPDATE
      `;
      if (!locked || locked.length === 0) throw new Error('Transferencia no encontrada');
      const transferRow = locked[0];
      if (transferRow.status !== 'PENDING') throw new Error('La transferencia no está en estado PENDING');

      const items = await tx.stockTransferItem.findMany({ where: { transferId: transferRow.id } });

      for (const item of items) {
           const originStock = await tx.branchInventory.findUnique({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transferRow.originBranchId } }
           });
           
           if (!originStock || Number(originStock.stock) < Number(item.quantity)) {
               throw new Error(`Stock insuficiente en origen para SKU ID ${item.skuId} al momento del envío`);
           }

           const updatedOrigin = await tx.branchInventory.update({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transferRow.originBranchId } },
               data: { stock: { decrement: Number(item.quantity) } }
           });

           /* NOTA: El stock del SKU (Global) NO DEBE MODIFICARSE al hacer ship/receive, 
              dado que el inventario global de la empresa no se destruye, solo cambia de sucursal. 
              Al enviarlo, la mercadería queda en el "limbo" físico pero sigue perteneciendo a la empresa. */

           await tx.stockMovement.create({
               data: {
                   skuId: item.skuId,
                   branchId: transferRow.originBranchId,
                   type: 'TRANSFER_OUT',
                   quantity: -Number(item.quantity),
                   resultingStock: Number(updatedOrigin.stock),
                   referenceId: `TX-OUT-${transferRow.id}`,
                   userId, 
                   notes: `Envío: Transferencia #${transferRow.id} a Sucursal ${transferRow.destinationBranchId}`
               }
           });
      }

      const result = await tx.stockTransfer.update({
          where: { id: transferRow.id },
          data: { status: 'IN_TRANSIT' }
      });

      await AuditService.logAction({
          adminId: userId,
          action: 'SHIP_STOCK_TRANSFER',
          entityType: 'STOCK_TRANSFER',
          entityId: result.id,
          branchId: transferRow.originBranchId,
          changes: { from: transferRow.status, to: result.status },
          ip: arguments[2]
      });

      return result;
    }, { maxWait: 20000, timeout: 20000 });
  }

  async receiveTransfer(id, userId) {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT * FROM "StockTransfer" WHERE id = ${parseInt(id)} FOR UPDATE
      `;
      if (!locked || locked.length === 0) throw new Error('Transferencia no encontrada');
      const transferRow = locked[0];
      if (transferRow.status !== 'IN_TRANSIT') throw new Error('La transferencia no está en estado IN_TRANSIT');

      const items = await tx.stockTransferItem.findMany({ where: { transferId: transferRow.id } });

      for (const item of items) {
           const sku = await tx.sKU.findUnique({ where: { id: item.skuId } });
           
           const originInv = await tx.branchInventory.findUnique({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transferRow.originBranchId } }
           });
           const originCost = originInv ? (originInv.costPrice ? parseFloat(originInv.costPrice.toString()) : 0) : 0;

           const currentDestInv = await tx.branchInventory.findUnique({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transferRow.destinationBranchId } }
           });

           let updatedInv;
           if (currentDestInv) {
               const currentStock = parseFloat(currentDestInv.stock.toString());
               const currentCost = parseFloat((currentDestInv.costPrice || originCost || 0).toString());
               const incomingQty = parseFloat(item.quantity.toString());
               const newTotalStock = currentStock + incomingQty;
               
               const weightedAverageCost = (currentStock * currentCost + incomingQty * originCost) / newTotalStock;

               updatedInv = await tx.branchInventory.update({
                   where: { id: currentDestInv.id },
                   data: { 
                       stock: { increment: Number(incomingQty) },
                       costPrice: weightedAverageCost
                   }
               });
           } else {
               updatedInv = await tx.branchInventory.create({
                   data: {
                       skuId: item.skuId,
                       branchId: transferRow.destinationBranchId,
                       stock: Number(item.quantity),
                       price: sku.price, 
                       costPrice: originCost 
                   }
               });
           }

           /* NOTA: No incrementamos el SKU global porque no es mercadería nueva creada ex novo. */

           await tx.stockMovement.create({
               data: {
                   skuId: item.skuId,
                   branchId: transferRow.destinationBranchId,
                   type: 'TRANSFER_IN',
                   quantity: Number(item.quantity),
                   resultingStock: Number(updatedInv.stock),
                   referenceId: `TX-IN-${transferRow.id}`,
                   userId, 
                   notes: `Recepción: Transferencia #${transferRow.id} desde Sucursal ${transferRow.originBranchId}`
               }
           });
      }

      const result = await tx.stockTransfer.update({
          where: { id: transferRow.id },
          data: { status: 'COMPLETED' }
      });

      await AuditService.logAction({
          adminId: userId,
          action: 'RECEIVE_STOCK_TRANSFER',
          entityType: 'STOCK_TRANSFER',
          entityId: result.id,
          branchId: transferRow.destinationBranchId,
          changes: { from: transferRow.status, to: result.status },
          ip: arguments[2]
      });

      return result;
    }, { maxWait: 20000, timeout: 20000 });
  }

  async cancelTransfer(id, userId) {
      return await prisma.$transaction(async (tx) => {
          const locked = await tx.$queryRaw`
            SELECT * FROM "StockTransfer" WHERE id = ${parseInt(id)} FOR UPDATE
          `;
          if (!locked || locked.length === 0) throw new Error('Transferencia no encontrada');
          const transferRow = locked[0];
          
          if (transferRow.status === 'PENDING') {
              return await tx.stockTransfer.update({
                  where: { id: transferRow.id },
                  data: { status: 'CANCELLED' }
              });
          } else {
              throw new Error('Solo se pueden cancelar transferencias en estado Pendiente. Si la mercadería ya fue despachada (En Tránsito), debe ser recibida.');
          }
      }, { maxWait: 20000, timeout: 20000 });
  }
}

module.exports = new StockTransferService();
