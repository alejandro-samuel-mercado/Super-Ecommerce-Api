const prisma = require('../config/prisma');
const AuthUtils = require('../utils/auth.utils');
const AuditService = require('./audit.service');

class UserService {

  /**
   * Crear usuario (Panel Admin / Registro)
   */
  async register(data, isFromAdmin = false) {
    const { email, password, name, roleId, branchId, ...profileData } = data;
    const normalizedEmail = email.toLowerCase();
    
    // Verificar existencia
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
        const err = new Error('El correo ya está registrado.');
        err.statusCode = 400;
        err.isOperational = true;
        throw err;
    }
    
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

    const newUser = await prisma.user.create({
        data: {
            email: normalizedEmail,
            password: hashedPassword,
            name,
            roleId: targetRoleId,
            branchId: branchId ? parseInt(branchId) : null,
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

    // Si se crea desde el panel con una sucursal y es Admin/Empleado, asociar
    if (isFromAdmin && branchId) {
        const bid = parseInt(branchId);
        // Si es Rol Admin/SuperAdmin (1 o 2), asociar en tabla pivot de permisos
        if ([1, 2].includes(newUser.roleId)) {
            await prisma.userBranch.create({
                data: {
                    userId: newUser.id,
                    branchId: bid
                }
            });
        }
    }

    return newUser;
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
      const { page = 1, limit = 20, search, branchId, role, isStaffOnly = false } = filters;
      const p = Math.max(1, parseInt(page));
      const l = Math.max(1, parseInt(limit));
      const skip = (p - 1) * l;
      
      const where = { status: { not: 'DELETED' } };
      const andConditions = [];

      if (isStaffOnly) {
          andConditions.push({ roleId: { notIn: [4, 99] } });
      }

      if (search) {
          const searchTrim = search.trim();
          andConditions.push({
              OR: [
                  { name: { contains: searchTrim, mode: 'insensitive' } },
                  { email: { contains: searchTrim, mode: 'insensitive' } },
                  { dni: { contains: searchTrim, mode: 'insensitive' } },
                  { phone: { contains: searchTrim, mode: 'insensitive' } }
              ]
          });
      }

      if (role) {
          andConditions.push({ role: { name: role } });
      }

      if (branchId && branchId !== 'all') {
          const bId = parseInt(branchId);
          andConditions.push({
              OR: [
                  { branchId: bId },
                  { adminBranches: { some: { branchId: bId } } },
                  { sales: { some: { branchId: bId } } }
              ]
          });
      }

      if (andConditions.length > 0) {
          where.AND = andConditions;
      }

      const [users, total] = await Promise.all([
          prisma.user.findMany({
              where,
              include: { 
                role: true,
                branch: true,
                adminBranches: { include: { branch: true } },
                sales: { select: { branchId: true }, take: 1 } 
              },
              orderBy: { createdAt: 'desc' },
              skip,
              take: l
          }),
          prisma.user.count({ where })
      ]);
      return { data: users, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
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
            branchId: null,
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
