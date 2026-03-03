const AuthUtils = require('../utils/auth.utils');
const prisma = require('../config/prisma');

/**
 * Middleware para validar el Access Token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No autorizado. Token faltante.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = AuthUtils.verifyAccessToken(token);

    const userId = parseInt(decoded.id);
    if (isNaN(userId)) {
        throw new Error('ID de usuario inválido en token');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (user && user.roleId) {
      user.role = await prisma.role.findUnique({
        where: { id: user.roleId }
      });
    }

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado o inactivo.' });
    }

    req.user = user; 
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error:', error.message);
    const msg = error.message ? error.message.toLowerCase() : '';
    if (msg.includes('prisma') || msg.includes('etimedout') || msg.includes('connection') || msg.includes('client') || msg.includes('timeout') || error.code === 'ETIMEDOUT') {
      return res.status(500).json({ success: false, message: 'Error de servidor. Reintentando...' });
    }
    
    console.error('[AuthMiddleware] Fallo de verificación:', error.message);
    return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
};

/**
 * Middleware que intenta validar el Access Token pero no falla si falta
 */
const optionalProtect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = AuthUtils.verifyAccessToken(token);

    const userId = parseInt(decoded.id);
    if (!isNaN(userId)) {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (user && user.status === 'ACTIVE') {
        if (user.roleId) {
          user.role = await prisma.role.findUnique({
            where: { id: user.roleId }
          });
        }
        req.user = user;
      }
    }
    next();
  } catch (error) {
    
    next();
  }
};

/**
 * Factory de middleware para restringir por Rol
 */
const authorize = (...roles) => {

  const allowedRoles = (roles.length > 0 && Array.isArray(roles[0])) ? roles[0] : roles;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    if (req.user.role.name === 'SUPER_ADMIN') {
        return next();
    }

    if (!allowedRoles.includes(req.user.role.name)) {
      console.warn(`[Auth] Acceso Denegado. Rol Usuario: ${req.user.role.name}. Requerido: ${allowedRoles.join(', ')}`);
      return res.status(403).json({ success: false, message: 'Acceso denegado. Rol insuficiente.' });
    }

    next();
  };
};

module.exports = { 
  authenticate, 
  authorize,
  protect: authenticate, 
  restrictTo: authorize,
  optionalProtect
};
