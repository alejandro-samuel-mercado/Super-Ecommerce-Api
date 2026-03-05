const prisma = require('../config/prisma');

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

      return await tx.stockTransfer.create({
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
    });
  }

  async shipTransfer(id, userId) {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT * FROM "StockTransfer" WHERE id = ${parseInt(id)} FOR UPDATE
      `;
      if (!locked || locked.length === 0) throw new Error('Transferencia no encontrada');
      const transferRow = locked[0];
      if (transferRow.status !== 'PENDING') throw new Error('La transferencia no está en estado PENDING');

      const items = await tx.stockTransferItem.findMany({ where: { stockTransferId: transferRow.id } });

      for (const item of items) {
           const originStock = await tx.branchInventory.findUnique({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transferRow.originBranchId } }
           });
           
           if (!originStock || Number(originStock.stock) < Number(item.quantity)) {
               throw new Error(`Stock insuficiente en origen para SKU ID ${item.skuId} al momento del envío`);
           }

           const updatedOrigin = await tx.branchInventory.update({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transferRow.originBranchId } },
               data: { stock: { decrement: item.quantity } }
           });

           await tx.sKU.update({
               where: { id: item.skuId },
               data: { stock: { decrement: item.quantity } }
           });

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

      return await tx.stockTransfer.update({
          where: { id: transferRow.id },
          data: { status: 'IN_TRANSIT' }
      });
    });
  }

  async receiveTransfer(id, userId) {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT * FROM "StockTransfer" WHERE id = ${parseInt(id)} FOR UPDATE
      `;
      if (!locked || locked.length === 0) throw new Error('Transferencia no encontrada');
      const transferRow = locked[0];
      if (transferRow.status !== 'IN_TRANSIT') throw new Error('La transferencia no está en estado IN_TRANSIT');

      const items = await tx.stockTransferItem.findMany({ where: { stockTransferId: transferRow.id } });

      for (const item of items) {
           const sku = await tx.sKU.findUnique({ where: { id: item.skuId } });

           const updatedInv = await tx.branchInventory.upsert({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transferRow.destinationBranchId } },
               update: { stock: { increment: item.quantity } },
               create: {
                   skuId: item.skuId,
                   branchId: transferRow.destinationBranchId,
                   stock: item.quantity,
                   price: sku.price, 
                   costPrice: null 
               }
           });

           await tx.sKU.update({
               where: { id: item.skuId },
               data: { stock: { increment: item.quantity } }
           });

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

      return await tx.stockTransfer.update({
          where: { id: transferRow.id },
          data: { status: 'COMPLETED' }
      });
    });
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
          } else if (transferRow.status === 'IN_TRANSIT') {
               const items = await tx.stockTransferItem.findMany({ where: { stockTransferId: transferRow.id } });
               for (const item of items) {
                   const updatedInv = await tx.branchInventory.update({
                       where: { skuId_branchId: { skuId: item.skuId, branchId: transferRow.originBranchId } },
                       data: { stock: { increment: item.quantity } }
                   });

                   await tx.sKU.update({
                       where: { id: item.skuId },
                       data: { stock: { increment: item.quantity } }
                   });

                   await tx.stockMovement.create({
                       data: {
                           skuId: item.skuId,
                           branchId: transferRow.originBranchId,
                           type: 'TRANSFER_IN',
                           quantity: Number(item.quantity),
                           resultingStock: Number(updatedInv.stock),
                           referenceId: `TX-CANCEL-${transferRow.id}`,
                           userId, 
                           notes: `Cancelación de Transferencia #${transferRow.id}`
                       }
                   });
               }
               return await tx.stockTransfer.update({
                  where: { id: transferRow.id },
                  data: { status: 'CANCELLED' }
              });
          } else {
              throw new Error('No se puede cancelar una transferencia completada o ya cancelada');
          }
      });
  }
}

module.exports = new StockTransferService();
