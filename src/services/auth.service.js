const prisma = require('../config/prisma');
const AuthUtils = require('../utils/auth.utils');
const AppError = require('../utils/app.error');
const NotificationService = require('./notification.service');
const crypto = require('crypto');

class AuthService {

  async forgotPassword(email) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new Error('No se encontró un usuario con ese correo electrónico.');

    // Generar código de 6 dígitos
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetCode, resetCodeExpires }
    });

    // Enviar email
    const subject = 'Código de recuperación de contraseña';
    const htmlContent = `
      <h1>Recuperación de contraseña</h1>
      <p>Hola ${user.name},</p>
      <p>Has solicitado restablecer tu contraseña. Tu código de verificación es:</p>
      <div style="font-size: 24px; font-weight: bold; padding: 10px; background: #f3f4f6; text-align: center; margin: 20px 0;">
        ${resetCode}
      </div>
      <p>Este código expira en 15 minutos.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
    `;

    await NotificationService.sendEmail(user.email, subject, htmlContent);

    return { message: 'Código enviado exitosamente' };
  }

  async resetPassword(email, code, newPassword) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new Error('Usuario no encontrado.');

    if (!user.resetCode || user.resetCode !== code) {
      throw new Error('El código es inválido.');
    }

    if (new Date() > user.resetCodeExpires) {
      throw new Error('El código ha expirado.');
    }

    const hashedPassword = await AuthUtils.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetCode: null,
        resetCodeExpires: null
      }
    });

    return { message: 'Contraseña actualizada exitosamente' };
  }

  async loginWithGoogle(profile) {
    const { email, name } = profile;
    const normalizedEmail = email.toLowerCase();

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true }
    });

    if (!user) {
      // Asignar rol por defecto (CUSTOMER)
      const role = await prisma.role.findUnique({
        where: { name: 'CUSTOMER' }
      });

      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: name,
          password: await AuthUtils.hashPassword(crypto.randomBytes(32).toString('hex')),
          roleId: role?.id,
          isActive: true
        },
        include: { role: true }
      });
    }

    // Generar tokens (pasando solo payload esencial)
    const payload = { id: user.id, role: user.role?.name || 'CUSTOMER' };
    const tokens = AuthUtils.generateTokens(payload);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: AuthUtils.sanitizeUser(user),
      tokens
    };
  }

  async register(data) {
    const { email, password, name, ...profileData } = data;
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new Error('Este correo electrónico ya está registrado.');

    // Asignar rol por defecto (CUSTOMER)
    const customerRole = await prisma.role.findUnique({ where: { name: 'CUSTOMER' } });
    if (!customerRole) throw new Error('El rol CUSTOMER no está configurado en el sistema.');

    const hashedPassword = await AuthUtils.hashPassword(password);

    // Crear Usuario
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        roleId: customerRole.id,
        ...profileData
      }
    });
    
    // Generar los tokens iniciales
    const payload = { id: newUser.id, role: 'CUSTOMER' };
    const { accessToken, refreshToken } = AuthUtils.generateTokens(payload);
    
    // Guardar token hash de refresco
    await this.saveRefreshToken(newUser.id, refreshToken);

    return { 
      user: { 
        id: newUser.id, 
        email: newUser.email, 
        name: newUser.name,
        dni: newUser.dni,
        phone: newUser.phone,
        address: newUser.address
      }, 
      tokens: { accessToken, refreshToken } 
    };
  }

  async getProfile(userId) {
      const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { 
            role: true,
            adminBranches: true 
          }
      });
      
      if (!user) throw new Error('El usuario ingresado no existe.');

      return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: { id: user.role.id, name: user.role.name },
          points: user.points,
          dni: user.dni,
          phone: user.phone,
          address: user.address,
          branchId: user.branchId,
          adminBranches: user.adminBranches
      };
  }

  async login(email, password) {
    const normalizedEmail = email.toLowerCase();
    
    let user;
    try {
        user = await prisma.user.findUnique({
             where: { email: normalizedEmail },
             include: { 
                role: true,
                adminBranches: true 
             }
        });
    } catch (dbError) {
        console.error('[AuthService] DB Error:', dbError);
        throw new AppError('Error de conexión con la base de datos.', 500, 'DB_ERROR');
    }

    if (!user) throw new AppError('El usuario ingresado no existe.', 400, 'INVALID_CREDENTIALS');
    if (user.status !== 'ACTIVO' && user.status !== 'ACTIVE') {
        throw new AppError('Esta cuenta ha sido desactivada.', 403, 'ACCOUNT_DISABLED');
    }

    const isValid = await AuthUtils.comparePassword(password, user.password);
    if (!isValid) throw new AppError('La contraseña es incorrecta.', 400, 'INVALID_CREDENTIALS');

    // --- Auto-asignar Sucursal si falta ---
    const isEmployee = user.role.name === 'EMPLOYEE';
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role.name);
    const isCustomer = user.role.name === 'CUSTOMER';
    
    let hasBranch = false;
    if (isEmployee) {
        hasBranch = !!user.branchId;
    } else if (isAdmin) {
        hasBranch = user.adminBranches && user.adminBranches.length > 0;
    } else {
        hasBranch = true;
    }

    if ((isEmployee || isAdmin) && !hasBranch) {
        try {
            // Buscar Casa Central o Primera Sucursal
            let defaultBranch = await prisma.branch.findFirst({ where: { isHeadquarters: true } });
            if (!defaultBranch) {
                defaultBranch = await prisma.branch.findFirst();
            }

            if (defaultBranch) {
                
                if (isEmployee) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { branchId: defaultBranch.id }
                    });
                    user.branchId = defaultBranch.id;
                } else {
                     // Usar upsert para evitar errores
                     await prisma.userBranch.upsert({
                        where: { userId_branchId: { userId: user.id, branchId: defaultBranch.id } },
                        update: {},
                        create: { userId: user.id, branchId: defaultBranch.id }
                     });
                     
                     // Helper para pushear al array local
                     const newAssignment = {
                         userId: user.id,
                         branchId: defaultBranch.id,
                         assignedAt: new Date(),
                         assignedBy: null,
                         branch: defaultBranch 
                     };
                     
                     if (!user.adminBranches) user.adminBranches = [];
                     user.adminBranches.push(newAssignment);
                }
            } else {
                console.warn('[AuthService] No branches found in system to assign.');
            }
        } catch (err) {
            console.error('[AuthService] Failed to auto-assign branch:', err);
            
        }
    }


    // Generar nuevos tokens
    const payload = { id: user.id, role: user.role.name };
    const { accessToken, refreshToken } = AuthUtils.generateTokens(payload);

    await this.saveRefreshToken(user.id, refreshToken);

    // Actualizar último login
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    return { 
        user: { 
            id: user.id, 
            name: user.name, 
            email: user.email,
            role: { id: user.role.id, name: user.role.name }, 
            points: user.points,
            dni: user.dni,
            phone: user.phone,
            address: user.address,
            branchId: user.branchId,
            adminBranches: user.adminBranches
        }, 
        tokens: { accessToken, refreshToken } 
    };
  }

  async refreshToken(token) {
    // 1. Validar integridad del JWT
    let decoded;
    try {
        decoded = AuthUtils.verifyRefreshToken(token);
    } catch(e) {
        throw new Error('Su sesión ha expirado, inicie sesión nuevamente.');
    }

    const storedToken = await prisma.refreshToken.findFirst({
        where: { userId: decoded.id },
        orderBy: { createdAt: 'desc' }
    });

    if (!storedToken || !AuthUtils.verifyHashedToken(token, storedToken.hashedToken)) {
        throw new Error('Su sesión ha sido invalidada, inicie sesión nuevamente.');
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id }, include: { role: true }});
    if (!user) throw new Error('El usuario de esta sesión ya no existe.');

    const payload = { id: user.id, role: user.role.name };
    const { accessToken, refreshToken: newRefreshToken } = AuthUtils.generateTokens(payload);
    
    await this.saveRefreshToken(user.id, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async saveRefreshToken(userId, token) {
      const hashedToken = AuthUtils.hashToken(token);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.refreshToken.deleteMany({
          where: { userId }
      });

      await prisma.refreshToken.create({
          data: {
              userId,
              hashedToken,
              expiresAt
          }
      });
  }
}

module.exports = new AuthService();
