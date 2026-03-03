const prisma = require('../config/prisma');

class SupplierService {
  
  async findAll(params = {}) {
    const { active, search } = params;
    
    const where = {};
    
    if (active !== undefined) {
      where.isActive = active === 'true' || active === true;
    }

    if (search) {
      where.OR = [
        { tradeName: { contains: search, mode: 'insensitive' } },
        { legalName: { contains: search, mode: 'insensitive' } },
        { taxId: { contains: search } }
      ];
    }

    return await prisma.supplier.findMany({
      where,
      orderBy: { tradeName: 'asc' }
    });
  }

  async findById(id) {
    if (!id || id === 'undefined' || id === 'null' || isNaN(parseInt(id))) {
       throw new Error('ID de proveedor inválido');
    }
    const supplier = await prisma.supplier.findUnique({
      where: { id: parseInt(id) },
      include: {
        skus: {
          include: { 
            sku: { 
              include: { 
                product: true,
                variantOptions: true
              } 
            } 
          }
        }
      }
    });

    if (!supplier) throw new Error('Proveedor no encontrado');

    return supplier;
  }

  async create(data, userId) {
    // Validar taxId (CUIT) único si se provee
    if (data.taxId) {
      const existing = await prisma.supplier.findUnique({ where: { taxId: data.taxId } });
      if (existing) throw new Error('El CUIT ya está registrado');
    }

    return await prisma.supplier.create({
      data: {
        tradeName: data.tradeName,
        legalName: data.legalName,
        taxId: data.taxId,
        taxStatus: data.taxStatus,
        email: data.email,
        phone: data.phone,
        billingAddress: data.billingAddress,
        isActive: true
      }
    });
  }

  async update(id, data, userId) {
    const supplier = await this.findById(id);

    // Si taxId (CUIT) cambió, verificar unicidad
    if (data.taxId && data.taxId !== supplier.taxId) {
      const existing = await prisma.supplier.findUnique({ where: { taxId: data.taxId } });
      if (existing) throw new Error('El CUIT ya está registrado');
    }

    return await prisma.supplier.update({
      where: { id: parseInt(id) },
      data: {
        tradeName: data.tradeName,
        legalName: data.legalName,
        taxId: data.taxId,
        taxStatus: data.taxStatus,
        email: data.email,
        phone: data.phone,
        billingAddress: data.billingAddress,
        isActive: data.isActive !== undefined ? data.isActive : supplier.isActive
      }
    });
  }

  // --- Gestión de SKUs del Proveedor ---

  async addSku(supplierId, data) {
      const { skuId, supplierSkuCode, basePurchasePrice, currency, estimatedDeliveryDays } = data;
      
      const existing = await prisma.supplierSKU.findUnique({
          where: { supplierId_skuId: { supplierId: parseInt(supplierId), skuId: parseInt(skuId) } }
      });

      if (existing) throw new Error('El SKU ya está asociado a este proveedor');

      const sku = await prisma.sKU.findUnique({ where: { id: parseInt(skuId) } });
      if (!sku) throw new Error('El SKU especificado no existe');

      const finalPrice = basePurchasePrice && parseFloat(basePurchasePrice) > 0 
                         ? parseFloat(basePurchasePrice) 
                         : parseFloat(sku.price);
                         
      const finalCurrency = currency || 'ARS';

      return await prisma.supplierSKU.create({
          data: {
              supplierId: parseInt(supplierId),
              skuId: parseInt(skuId),
              supplierSkuCode,
              basePurchasePrice: finalPrice,
              currency: finalCurrency,
              estimatedDeliveryDays
          }
      });
  }

  async removeSku(supplierId, skuId) {
      return await prisma.supplierSKU.delete({
          where: { supplierId_skuId: { supplierId: parseInt(supplierId), skuId: parseInt(skuId) } }
      });
  }
}

module.exports = new SupplierService();
