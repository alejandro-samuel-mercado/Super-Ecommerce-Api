const prisma = require('../config/prisma');

/**
 * Middleware para verificar si la tienda está en modo mantenimiento.
 * Bloquea el acceso a rutas públicas si maintenanceMode = true.
 * Permite acceso a rutas de admin y autenticación de admin (si se organizaran así).
 * 
 * Estrategia:
 * 1. Obtener la configuración.
 * 2. Si maintenanceMode es false, next().
 * 3. Si es true, verificar si la ruta es whitelist (ej: /api/admin, /api/auth/login).
 *    PERO, como este middleware se aplicará globalmente o en rutas específicas,
 *    es mejor aplicarlo SOLO a las rutas de tienda (products, categories, sales, etc).
 *    Y NO aplicarlo a /api/admin o /api/auth.
 */
let cachedConfig = null;
let lastFetch = 0;
const CACHE_TTL = 5000; 

const checkMaintenanceMode = async (req, res, next) => {
    try {
        const now = Date.now();
        
        // Usar caché si aún es válido
        if (!cachedConfig || (now - lastFetch) > CACHE_TTL) {
            cachedConfig = await prisma.storeConfig.findFirst({ where: { id: 1 } });
            lastFetch = now;
        }
        
        if (cachedConfig && cachedConfig.maintenanceMode) {
            return res.status(503).json({
                success: false,
                message: 'La tienda se encuentra en mantenimiento. Por favor intente más tarde.',
                maintenance: true
            });
        }
        
        next();
    } catch (error) {
        console.error('[MaintenanceMiddleware] Error checking config:', error);
        next(); 
    }
};

module.exports = checkMaintenanceMode;
