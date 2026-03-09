const { Router } = require('express');
const ShippingController = require('../controllers/shipping.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = Router();

/**
 * @route POST /api/shipping/calculate-cost
 * @desc Calcular coste de envío para el checkout
 * @access Público
 */
router.post('/calculate-cost', ShippingController.calculateCost);

/**
 * @route GET /api/shipping/available-zones
 * @desc Obtener zonas de envío disponibles
 * @access Público
 */
router.get('/available-zones', ShippingController.getAvailableZones);

// Rutas de administración accesibles para empleados
router.use(protect);

/**
 * @route GET /api/shipping
 * @desc Obtener todas las zonas de envío
 * @access Admin/Employee
 */
router.get('/', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), ShippingController.getZones);

router.use(restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'));

/**
 * @route POST /api/shipping
 * @desc Crear nueva zona de envío
 * @access Admin/Super Admin
 */
router.post('/', ShippingController.createZone);

/**
 * @route PUT /api/shipping/:id
 * @desc Actualizar una zona de envío
 * @access Admin/Super Admin
 */
router.put('/:id', ShippingController.updateZone);

/**
 * @route DELETE /api/shipping/:id
 * @desc Eliminar una zona de envío
 * @access Admin/Super Admin
 */
router.delete('/:id', ShippingController.deleteZone);

module.exports = router;
