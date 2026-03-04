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
        const hasDest = userBranchIds.includes(parseInt(destinationBranchId));

        if (!hasOrigin || !hasDest) {
            throw new Error('No tienes permisos en ambas sucursales para realizar esta transferencia');
        }
    }


    for (const item of items) {
       const originStock = await prisma.branchInventory.findUnique({
           where: { skuId_branchId: { skuId: item.skuId, branchId: originBranchId } }
       });
       if (!originStock || Number(originStock.stock) < Number(item.quantity)) {
           throw new Error(`Stock insuficiente en origen para SKU ID ${item.skuId}`);
       }
    }

    return await prisma.stockTransfer.create({
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
  }

  async shipTransfer(id, userId) {
    return await prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ 
          where: { id: parseInt(id) },
          include: { items: true } 
      });

      if (!transfer) throw new Error('Transferencia no encontrada');
      if (transfer.status !== 'PENDING') throw new Error('La transferencia no está en estado PENDING');

      // Deducir stock
      for (const item of transfer.items) {
           const originStock = await tx.branchInventory.findUnique({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transfer.originBranchId } }
           });
           
           if (!originStock || Number(originStock.stock) < Number(item.quantity)) {
               throw new Error(`Stock insuficiente en origen para SKU ID ${item.skuId} al momento del envío`);
           }

           const updatedOrigin = await tx.branchInventory.update({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transfer.originBranchId } },
               data: { stock: { decrement: item.quantity } }
           });

           await tx.sKU.update({
               where: { id: item.skuId },
               data: { stock: { decrement: item.quantity } }
           });

           // Registrar TRANSFER_OUT
           await tx.stockMovement.create({
               data: {
                   skuId: item.skuId,
                   branchId: transfer.originBranchId,
                   type: 'TRANSFER_OUT',
                   quantity: -Number(item.quantity),
                   resultingStock: Number(updatedOrigin.stock),
                   referenceId: `TX-OUT-${transfer.id}`,
                   userId, 
                   notes: `Envío: Transferencia #${transfer.id} a Sucursal ${transfer.destinationBranchId}`
               }
           });
      }

      return await tx.stockTransfer.update({
          where: { id: transfer.id },
          data: { status: 'IN_TRANSIT' }
      });
    });
  }

  async receiveTransfer(id, userId) {

    return await prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ 
          where: { id: parseInt(id) },
          include: { items: true } 
      });

      if (!transfer) throw new Error('Transferencia no encontrada');
      if (transfer.status !== 'IN_TRANSIT') throw new Error('La transferencia no está en estado IN_TRANSIT');

      // Agregar stock
      for (const item of transfer.items) {
      
           const sku = await tx.sKU.findUnique({ where: { id: item.skuId } });

           const updatedInv = await tx.branchInventory.upsert({
               where: { skuId_branchId: { skuId: item.skuId, branchId: transfer.destinationBranchId } },
               update: { stock: { increment: item.quantity } },
               create: {
                   skuId: item.skuId,
                   branchId: transfer.destinationBranchId,
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
                   branchId: transfer.destinationBranchId,
                   type: 'TRANSFER_IN',
                   quantity: Number(item.quantity),
                   resultingStock: Number(updatedInv.stock),
                   referenceId: `TX-IN-${transfer.id}`,
                   userId, 
                   notes: `Recepción: Transferencia #${transfer.id} desde Sucursal ${transfer.originBranchId}`
               }
           });
      }

      return await tx.stockTransfer.update({
          where: { id: transfer.id },
          data: { status: 'COMPLETED' }
      });
    });
  }

  async cancelTransfer(id, userId) {

      return await prisma.$transaction(async (tx) => {
          const transfer = await tx.stockTransfer.findUnique({ where: { id: parseInt(id) }, include: { items: true } });
          
          if (!transfer) throw new Error('Transferencia no encontrada');
          
          if (transfer.status === 'PENDING') {
              return await tx.stockTransfer.update({
                  where: { id: transfer.id },
                  data: { status: 'CANCELLED' }
              });
          } else if (transfer.status === 'IN_TRANSIT') {
               for (const item of transfer.items) {
                   const updatedInv = await tx.branchInventory.update({
                       where: { skuId_branchId: { skuId: item.skuId, branchId: transfer.originBranchId } },
                       data: { stock: { increment: item.quantity } }
                   });

                   await tx.sKU.update({
                       where: { id: item.skuId },
                       data: { stock: { increment: item.quantity } }
                   });

                   await tx.stockMovement.create({
                       data: {
                           skuId: item.skuId,
                           branchId: transfer.originBranchId,
                           type: 'TRANSFER_IN',
                           quantity: Number(item.quantity),
                           resultingStock: Number(updatedInv.stock),
                           referenceId: `TX-CANCEL-${transfer.id}`,
                           userId, 
                           notes: `Cancelación de Transferencia #${transfer.id}`
                       }
                   });
               }
               return await tx.stockTransfer.update({
                  where: { id: transfer.id },
                  data: { status: 'CANCELLED' }
              });
          } else {
              throw new Error('No se puede cancelar una transferencia completada o ya cancelada');
          }
      });
  }
}

module.exports = new StockTransferService();
