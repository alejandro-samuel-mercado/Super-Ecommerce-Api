const prisma = require('../config/prisma');
const AuditService = require('./audit.service');

class AdminProductService {

  async updateProduct(adminId, productId, data, ip) {
    
      const product = await prisma.product.findUnique({ where: { id: parseInt(productId) } });
      if (!product) throw new Error('Producto no encontrado');

      const updatedProduct = await prisma.product.update({
          where: { id: parseInt(productId) },
          data
      });

      // Audit solo campos clave
      const changes = {};
      Object.keys(data).forEach(k => {
          if (product[k] !== data[k]) changes[k] = { prev: product[k], new: data[k] };
      });

      if (Object.keys(changes).length > 0) {
          await AuditService.logAction({
              adminId,
              action: 'UPDATE_PRODUCT',
              entityType: 'PRODUCT',
              entityId: productId,
              changes,
              ip
          });
      }

      return updatedProduct;
  }

  async softDeleteProduct(adminId, productId, ip) {
      return await this.updateProduct(adminId, productId, { isActive: false }, ip);
  }
}

module.exports = new AdminProductService();
