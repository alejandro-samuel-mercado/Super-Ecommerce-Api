const { Router } = require('express');
const SystemController = require('../controllers/system.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');

const router = Router();

// Limitador de peticiones para reportes de error: 5 por minuto por IP
const reportLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 5,
    message: { success: false, message: 'Demasiados reportes de error.' }
});

/**
 * @route GET /api/system/status
 * @desc Comprobar estado de salud del sistema
 * @access Público
 */
router.get('/status', SystemController.getSystemStatus);

/**
 * @route POST /api/system/report-error
 * @desc Reportar un error desde el cliente (protegido por limitador de tasa)
 * @access Público
 */
router.post('/report-error', reportLimiter, SystemController.reportError);

/**
 * @route GET /api/system/alerts
 * @desc Obtener alertas del sistema
 * @access Admin/Super Admin
 */
router.get('/alerts', protect, restrictTo(['ADMIN', 'SUPER_ADMIN']), SystemController.getAlerts);

/**
 * @route PATCH /api/system/alerts/:id/resolve
 * @desc Marcar una alerta como resuelta
 * @access Admin/Super Admin
 */
router.patch('/alerts/:id/resolve', protect, restrictTo(['ADMIN', 'SUPER_ADMIN']), SystemController.resolveAlert);

module.exports = router;
