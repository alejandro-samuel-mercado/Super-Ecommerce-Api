const prisma = require('../config/prisma');
const AuditService = require('./audit.service');

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

    if (data.adminId) {
      await AuditService.logAction({
        adminId: data.adminId,
        action: 'CREATE_BRANCH',
        entityType: 'BRANCH',
        entityId: branch.id,
        branchId: branch.id,
        changes: branch,
        ip: data.ip
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

    const updatedBranch = await prisma.branch.update({
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

    if (data.adminId) {
        const changes = {};
        Object.keys(data).forEach(k => {
            if (['adminId', 'ip'].includes(k)) return;
            if (JSON.stringify(branch[k]) !== JSON.stringify(data[k])) {
                changes[k] = { prev: branch[k], new: data[k] };
            }
        });

        if (Object.keys(changes).length > 0) {
            await AuditService.logAction({
                adminId: data.adminId,
                action: 'UPDATE_BRANCH',
                entityType: 'BRANCH',
                entityId: id,
                branchId: id,
                changes,
                ip: data.ip
            });
        }
    }

    return updatedBranch;
  }

  async delete(id) {
    const branchId = parseInt(id);
    
    // Verificar restricciones
    // 1. VENTAS
    const salesCount = await prisma.sale.count({ where: { branchId } });
    if (salesCount > 0) throw new Error('No se puede eliminar: Tiene historial de ventas');

    // 2. INVENTARIO
    const stockCount = await prisma.branchInventory.count({ where: { branchId, stock: { gt: 0 } } });
    if (stockCount > 0) throw new Error('No se puede eliminar: Tiene stock físico asignado');

    const result = await prisma.branch.delete({
      where: { id: branchId }
    });

   
    const adminId = arguments[1]; 
    const ip = arguments[2];

    if (adminId) {
        await AuditService.logAction({
            adminId,
            action: 'DELETE_BRANCH',
            entityType: 'BRANCH',
            entityId: branchId,
            branchId: branchId,
            changes: result,
            ip
        });
    }

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
          const result = await prisma.user.update({
              where: { id: parsedUserId },
              data: { branchId: parsedBranchId }
          });

          if (assignedBy) {
              await AuditService.logAction({
                  adminId: parseInt(assignedBy),
                  action: 'ASSIGN_USER_TO_BRANCH',
                  entityType: 'USER',
                  entityId: parsedUserId,
                  branchId: parsedBranchId,
                  changes: { branchId: parsedBranchId },
                  ip: arguments[3]
              });
          }
          return result;
      } else {
          const exists = await prisma.userBranch.findUnique({
              where: { userId_branchId: { userId: parsedUserId, branchId: parsedBranchId } }
          });
          
          if (exists) return exists;
          
          const result = await prisma.userBranch.create({
              data: {
                  userId: parsedUserId,
                  branchId: parsedBranchId,
                  assignedBy: assignedBy ? parseInt(assignedBy) : null
              }
          });

          if (assignedBy) {
              await AuditService.logAction({
                  adminId: parseInt(assignedBy),
                  action: 'ASSIGN_USER_TO_BRANCH',
                  entityType: 'USER',
                  entityId: parsedUserId,
                  branchId: parsedBranchId,
                  changes: { branchId: parsedBranchId },
                  ip: arguments[3]
              });
          }
          return result;
      }
  }

  async removeUser(branchId, userId) {
      const parsedBranchId = parseInt(branchId);
      const parsedUserId = parseInt(userId);

      const user = await prisma.user.findUnique({ where: { id: parsedUserId }, include: { role: true } });
      if (!user) throw new Error('Usuario no encontrado');

      if (user.role.name === 'EMPLOYEE') {
          if (user.branchId === parsedBranchId) {
               const result = await prisma.user.update({
                  where: { id: parsedUserId },
                  data: { branchId: null }
              });

              const adminId = arguments[2];
              const ip = arguments[3];
              if (adminId) {
                  await AuditService.logAction({
                      adminId: parseInt(adminId),
                      action: 'REMOVE_USER_FROM_BRANCH',
                      entityType: 'USER',
                      entityId: parsedUserId,
                      branchId: parsedBranchId,
                      changes: { removedFromBranchId: parsedBranchId },
                      ip
                  });
              }
              return result;
          }
      } else {
          try {
              const result = await prisma.userBranch.delete({
                  where: { userId_branchId: { userId: parsedUserId, branchId: parsedBranchId } }
              });

              const adminId = arguments[2];
              const ip = arguments[3];
              if (adminId) {
                  await AuditService.logAction({
                      adminId: parseInt(adminId),
                      action: 'REMOVE_USER_FROM_BRANCH',
                      entityType: 'USER',
                      entityId: parsedUserId,
                      branchId: parsedBranchId,
                      changes: { removedFromBranchId: parsedBranchId },
                      ip
                  });
              }
              return result;
          } catch (e) {
              if (e.code === 'P2025') return;
              throw e;
          }
      }
  }
}

module.exports = new BranchService();
