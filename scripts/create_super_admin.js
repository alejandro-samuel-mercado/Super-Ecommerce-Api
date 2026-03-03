const prisma = require('./src/config/prisma');
const AuthUtils = require('./src/utils/auth.utils');

async function createSuperAdmin() {
  const email = 'alesamu.am@gmail.com';
  const password = '181021Aa';
  const name = 'Alejandro Mercado';

  try {
    /** Verificar si ya existe */
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`⚠️ El usuario ${email} ya existe.`);
      return;
    }

    /** Obtener Rol SUPER_ADMIN */
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    if (!superAdminRole) {
      console.error('❌ Error: El rol SUPER_ADMIN no existe en la base de datos. Ejecuta seed.js primero.');
      return;
    }

    /** Generar hash de la contraseña */
    const hashedPassword = await AuthUtils.hashPassword(password);

    /** Crear Usuario */
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId: superAdminRole.id,
        estado: 'ACTIVO'
      }
    });

    console.log(`✅ Super Administrador creado exitosamente: ID ${user.id} - ${user.email}`);

  } catch (error) {
    console.error('❌ Error creando al Super Administrador:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();
