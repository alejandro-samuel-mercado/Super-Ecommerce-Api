const { Router } = require('express');
const AdminController = require('../controllers/admin.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = Router();

// Todas las rutas requieren autenticación y nivel de acceso específico
router.use(protect);
router.use(restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'));

/**
 * @route GET /api/admin/stats
 * @desc Obtener estadísticas generales
 * @access Admin/Employee
 */
router.get('/stats', AdminController.getStats);

/**
 * @route GET /api/admin/audit
 * @desc Obtener registros de auditoría
 * @access Admin/Employee
 */
router.get('/audit', AdminController.getAuditLogs);

/**
 * @route POST /api/admin/users/:id/verify
 * @desc Verificar a un usuario
 * @access Admin/Employee
 */
router.post('/users/:id/verify', AdminController.verifyUser);

/**
 * @route POST /api/admin/users/:id/status
 * @desc Cambiar el estado de un usuario
 * @access Admin/Employee
 */
router.post('/users/:id/status', AdminController.toggleUserStatus);

/**
 * @route POST /api/admin/users/:id/points
 * @desc Ajustar los puntos de fidelidad de un usuario
 * @access Admin/Employee
 */
router.post('/users/:id/points', AdminController.adjustPoints);

module.exports = router;
