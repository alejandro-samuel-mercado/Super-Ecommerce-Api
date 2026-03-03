const prisma = require('../config/prisma');
const UploadService = require('./upload.service');

class TransferService {
  /**
   * Crea una nueva transferencia con comprobante
   */
  async createTransfer(userId, amount, imageBuffer, branchId) {
    // 1. Subir imagen
    const imageUrl = await UploadService.uploadImage(imageBuffer, 'comprobantes');

    // 2. Crear registro
    return await prisma.transfer.create({
      data: {
        userId: parseInt(userId),
        amount: parseFloat(amount),
        imageUrl,
        status: 'PENDING',
        branchId: branchId ? parseInt(branchId) : null
      }
    });
  }

  /**
   * Obtiene todas las transferencias (Admin)
   */
  async getAllTransfers(branchId) {
    const where = {};
    if (branchId) {
        where.branchId = parseInt(branchId);
    }

    return await prisma.transfer.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, dni: true, phone: true }
        },
        branch: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Obtiene transferencias de un usuario
   */
  async getUserTransfers(userId) {
    return await prisma.transfer.findMany({
      where: { userId: parseInt(userId) },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Actualiza el estado de una transferencia
   */
  async updateStatus(id, status) {
    return await prisma.transfer.update({
      where: { id: parseInt(id) },
      data: { status }
    });
  }
}

module.exports = new TransferService();
