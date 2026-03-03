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
router.use(restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'));

/**
 * @route GET /api/config
 * @desc Obtener configuración completa de la tienda
 * @access Admin/Employee
 */
router.get('/', getConfig);

/**
 * @route PUT /api/config
 * @desc Actualizar la configuración de la tienda
 * @access Admin/Employee
 */
router.put('/', updateConfig);

module.exports = router;
