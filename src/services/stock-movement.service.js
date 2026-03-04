const prisma = require('../config/prisma');

class StockMovementService {
  
  /**
   * Registra un movimiento de stock.
   * @param {Object} tx - Transacción de Prisma (Opcional)
   * @param {Object} data - Datos del movimiento
   */
  async create(tx, data) {
    const client = tx || prisma;
    
    // Calcular stock resultante (snapshot)
    let resultingStock = data.resultingStock;
    
    if (resultingStock === undefined) {
        const inventory = await client.branchInventory.findUnique({
             where: { skuId_branchId: { skuId: data.skuId, branchId: data.branchId } }
        });
        resultingStock = inventory ? Number(inventory.stock) : 0;
    }

    return await client.stockMovement.create({
      data: {
        skuId: data.skuId,
        branchId: data.branchId,
        type: data.type,
        quantity: data.quantity,
        resultingStock,
        referenceId: data.referenceId,
        userId: data.userId,
        notes: data.notes
      }
    });
  }

  async getAll(params = {}) {
      const { branchId, skuId, type, startDate, endDate } = params;
      const where = {};

      if (branchId) where.branchId = parseInt(branchId);
      if (skuId) where.skuId = parseInt(skuId);
      if (type) where.type = type;
      
      if (startDate && endDate) {
          where.createdAt = {
              gte: new Date(startDate),
              lte: new Date(endDate)
          };
      }

      return await prisma.stockMovement.findMany({
          where,
          include: {
              sku: { include: { product: true } },
              branch: true,
          },
          orderBy: { createdAt: 'desc' }
      });
  }
}

module.exports = new StockMovementService();
