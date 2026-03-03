const prisma = require('../config/prisma');

class BranchService {

  async findAll(params = {}) {
    const where = {};
    
    if (params && params.isActive !== undefined) {
        const val = params.isActive;
        if (val === 'true' || val === true) {
            where.isActive = true;
        } else if (val === 'false' || val === false) {
            where.isActive = false;
        }
    }

    return await prisma.branch.findMany({
      where,
      orderBy: { id: 'asc' }
    });
  }

  async findOne(id) {
    return await prisma.branch.findUnique({
      where: { id: parseInt(id) },
      include: {
        inventory: {
             select: { id: true }
        }
      }
    });
  }

  async create(data) {
  // Validar código único
  const existing = await prisma.branch.findUnique({ where: { code: data.code } });
  if (existing) throw new Error('Ya existe una sucursal con este código');

  return await prisma.$transaction(async (tx) => {
    // 1. Crear la sucursal
    const branch = await tx.branch.create({
      data: {
        name: data.name,
        code: data.code,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country || 'Argentina',
        phone: data.phone,
        email: data.email,
        latitude: data.latitude,
        longitude: data.longitude,
        operatingHours: data.operatingHours || {},
        isActive: data.isActive !== undefined ? data.isActive : true,
        isHeadquarters: data.isHeadquarters || false
      }
    });

    // 2. Obtener todos los SKUs activos para crear inventario
    const allSkus = await tx.sKU.findMany({
      where: {
        product: { isActive: true }
      },
      include: {
        product: {
          select: { basePrice: true }
        }
      }
    });

    // 3. Crear BranchInventory para todos los SKUs
    if (allSkus.length > 0) {
      const inventoryRecords = allSkus.map(sku => ({
        skuId: sku.id,
        branchId: branch.id,
        stock: 0,
        minStock: 5,
        price: sku.price || sku.product.basePrice,
        isActive: true
      }));

      await tx.branchInventory.createMany({
        data: inventoryRecords
      });
    }

    return branch;
  });
}

  async update(id, data) {
    const branch = await prisma.branch.findUnique({ where: { id: parseInt(id) } });
    if (!branch) throw new Error('Sucursal no encontrada');

    if (data.code && data.code !== branch.code) {
         const existing = await prisma.branch.findUnique({ where: { code: data.code } });
         if (existing) throw new Error('Código en uso por otra sucursal');
    }

    return await prisma.branch.update({
      where: { id: parseInt(id) },
      data: {
          name: data.name,
          code: data.code,
          address: data.address,
          city: data.city,
          state: data.state,
          country: data.country,
          phone: data.phone,
          email: data.email,
          latitude: data.latitude,
          longitude: data.longitude,
          isActive: data.isActive,
          operatingHours: data.operatingHours
      }
    });
  }

  async delete(id) {
    const branchId = parseInt(id);
    
    // Verificar restricciones
    // 1. Sales
    const salesCount = await prisma.sale.count({ where: { branchId } });
    if (salesCount > 0) throw new Error('No se puede eliminar: Tiene historial de ventas');

    // 2. Inventory
    const stockCount = await prisma.branchInventory.count({ where: { branchId, stock: { gt: 0 } } });
    if (stockCount > 0) throw new Error('No se puede eliminar: Tiene stock físico asignado');

    const result = await prisma.branch.delete({
      where: { id: branchId }
    });
    return result;
  }

  // --- GESTIÓN DE USUARIOS ---

  async getUsers(branchId) {
      const id = parseInt(branchId);
      const employees = await prisma.user.findMany({
          where: { branchId: id },
          include: { role: true }
      });
      
      const adminAssignments = await prisma.userBranch.findMany({
          where: { branchId: id },
          include: { 
              user: { include: { role: true } } 
          }
      });
      
      const admins = adminAssignments.map(a => {
          return { ...a.user, assignedAt: a.assignedAt };
      });
      
      return [...employees, ...admins];
  }

  async addUser(branchId, userId, assignedBy) {
      const parsedBranchId = parseInt(branchId);
      const parsedUserId = parseInt(userId);
      
      const user = await prisma.user.findUnique({ where: { id: parsedUserId }, include: { role: true } });
      if (!user) throw new Error('Usuario no encontrado');

      if (user.role.name === 'EMPLOYEE') {
          return await prisma.user.update({
              where: { id: parsedUserId },
              data: { branchId: parsedBranchId }
          });
      } else {
          const exists = await prisma.userBranch.findUnique({
              where: { userId_branchId: { userId: parsedUserId, branchId: parsedBranchId } }
          });
          
          if (exists) return exists;
          
          return await prisma.userBranch.create({
              data: {
                  userId: parsedUserId,
                  branchId: parsedBranchId,
                  assignedBy: assignedBy ? parseInt(assignedBy) : null
              }
          });
      }
  }

  async removeUser(branchId, userId) {
      const parsedBranchId = parseInt(branchId);
      const parsedUserId = parseInt(userId);

      const user = await prisma.user.findUnique({ where: { id: parsedUserId }, include: { role: true } });
      if (!user) throw new Error('Usuario no encontrado');

      if (user.role.name === 'EMPLOYEE') {
          if (user.branchId === parsedBranchId) {
               return await prisma.user.update({
                  where: { id: parsedUserId },
                  data: { branchId: null }
              });
          }
      } else {
          try {
              return await prisma.userBranch.delete({
                  where: { userId_branchId: { userId: parsedUserId, branchId: parsedBranchId } }
              });
          } catch (e) {
              if (e.code === 'P2025') return;
              throw e;
          }
      }
  }
}

module.exports = new BranchService();
