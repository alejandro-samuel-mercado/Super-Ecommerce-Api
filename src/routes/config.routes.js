const { Router } = require('express');
const { getConfig, updateConfig, getPublicConfig } = require('../controllers/config.controller');

const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = Router();

/**
 * @route GET /api/config/public
 * @desc Obtener configuración pública de la tienda
 * @access Público
 */
router.get('/public', getPublicConfig);

// Rutas protegidas
router.use(protect);

/**
 * @route GET /api/config
 * @desc Obtener configuración completa de la tienda
 * @access Admin/Employee
 */
router.get('/', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), getConfig);

/**
 * @route PUT /api/config
 * @desc Actualizar la configuración de la tienda
 * @access Admin/Super Admin
 */
router.put('/', restrictTo('ADMIN', 'SUPER_ADMIN'), updateConfig);

module.exports = router;
