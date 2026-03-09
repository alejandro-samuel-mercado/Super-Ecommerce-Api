const prisma = require('../config/prisma');
const AuthUtils = require('../utils/auth.utils');
const AuditService = require('./audit.service');

class UserService {

  /**
   * Crear usuario (Panel Admin / Registro)
   */
  async register(data, isFromAdmin = false) {
    const { email, password, name, roleId, ...profileData } = data;
    const normalizedEmail = email.toLowerCase();
    
    // Verificar existencia
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new Error('El correo ya está registrado.');
    
    // Hashear Contraseña
    if (!password) throw new Error('La contraseña es obligatoria');
    const hashedPassword = await AuthUtils.hashPassword(password);
    
    let targetRoleId;
    if (isFromAdmin && roleId) {
        targetRoleId = parseInt(roleId);
    } else {
        const customerRole = await prisma.role.findUnique({ where: { name: 'CUSTOMER' } });
        targetRoleId = customerRole.id;
    }

    return await prisma.user.create({
        data: {
            email: normalizedEmail,
            password: hashedPassword,
            name,
            roleId: targetRoleId,
            address: profileData.address,
            city: profileData.city,
            state: profileData.state,
            zipCode: profileData.zipCode,
            country: profileData.country,
            phone: profileData.phone,
            status: profileData.status || 'ACTIVE' 
        },
        include: { role: true }
    });
  }

  async getProfile(userId) {
    return await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: { 
          role: true, 
          pointsHistory: { orderBy: { createdAt: 'desc' }, take: 20 } 
      }
    });
  }

  async updateProfile(userId, data) {
    // Sanitización y armado explícito del objeto de actualización
    // Esto previene que Prisma crashee por relaciones u objetos (como el branch, adminBranches).
    let updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.profileImage !== undefined) updateData.profileImage = data.profileImage;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.dni !== undefined) updateData.dni = data.dni;
    if (data.dniVerified !== undefined) updateData.dniVerified = data.dniVerified;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.zipCode !== undefined) updateData.zipCode = data.zipCode;

    if (data.branchId !== undefined) {
      updateData.branchId = data.branchId ? parseInt(data.branchId) : null;
    }
    if (data.activeBranchId !== undefined) {
      updateData.activeBranchId = data.activeBranchId ? parseInt(data.activeBranchId) : null;
    }

    if (data.roleId) updateData.roleId = parseInt(data.roleId);

  
    if (data.password && data.password.trim() !== '') {
        updateData.password = await AuthUtils.hashPassword(data.password);
    }

    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) throw new Error('User not found');

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: updateData,
      include: { role: true }
    });

    if (data.adminId) {
      const changes = {};
      Object.keys(updateData).forEach(k => {
        if (user[k] !== updateData[k]) {
          changes[k] = { prev: user[k], new: updateData[k] };
        }
      });

      if (Object.keys(changes).length > 0) {
        await AuditService.logAction({
          adminId: data.adminId,
          action: 'UPDATE_USER_PROFILE',
          entityType: 'USER',
          entityId: userId,
          branchId: data.branchId || user.branchId || null,
          changes,
          ip: data.ip
        });
      }
    }

    return updatedUser;
  }

  // --- ADMINISTRACIÓN ---
  
  async getAllUsers(filters = {}) {
      return await prisma.user.findMany({
          include: { 
            role: true,
            branch: true,
            adminBranches: { include: { branch: true } },
            sales: { select: { branchId: true } } 
          },
          orderBy: { createdAt: 'desc' }
      });
  }

  async updateUserRole(id, roleId) {
      return await prisma.user.update({
          where: { id: parseInt(id) },
          data: { roleId: parseInt(roleId) }
      });
  }

  async deleteUser(id, adminId, ip) {
    const userId = parseInt(id);
    const salesCount = await prisma.sale.count({ where: { userId } });
    
    const result = salesCount > 0 
        ? await prisma.user.update({
            where: { id: userId },
            data: { 
                status: 'DELETED',
                email: `deleted_${userId}@super.ecommerce`,
                name: 'Usuario Eliminado',
                password: '***',
                dni: null,
                phone: null,
                address: null,
                city: null,
                state: null,
                country: null,
                zipCode: null
            }
        })
        : await prisma.user.delete({
            where: { id: userId }
        });

    if (adminId) {
        await AuditService.logAction({
            adminId,
            action: 'DELETE_USER',
            entityType: 'USER',
            entityId: userId,
            branchId: null, // Global user deletion
            changes: { status: 'DELETED' },
            ip
        });
    }

    return result;
  }

  // --- FAVORITOS ---

  async getFavorites(userId) {
      const user = await prisma.user.findUnique({
          where: { id: parseInt(userId) },
          include: { 
              favorites: {
                  include: {
                    skus: true
                  }
              } 
          }
      });
      return user ? user.favorites : [];
  }

  async addFavorite(userId, productId) {
      return await prisma.user.update({
          where: { id: parseInt(userId) },
          data: {
              favorites: {
                  connect: { id: parseInt(productId) }
              }
          },
          include: { favorites: true }
      });
  }

  async removeFavorite(userId, productId) {
      return await prisma.user.update({
          where: { id: parseInt(userId) },
          data: {
              favorites: {
                  disconnect: { id: parseInt(productId) }
              }
          },
          include: { favorites: true }
      });
  }
}

module.exports = new UserService();
