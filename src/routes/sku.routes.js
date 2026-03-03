const express = require('express');
const router = express.Router();
const SkuController = require('../controllers/sku.controller');

const { protect, restrictTo } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/skus
 * @desc Obtener lista de SKUs
 * @access Público
 */
router.get('/', SkuController.findAll);

// Rutas de administración protegidas
router.use(protect);
router.use(restrictTo('ADMIN', 'SUPER_ADMIN'));

/**
 * @route POST /api/skus
 * @desc Crear un nuevo SKU
 * @access Admin/Super Admin
 */
router.post('/', SkuController.create); 

/**
 * @route PUT /api/skus/:id
 * @desc Actualizar un SKU
 * @access Admin/Super Admin
 */
router.put('/:id', SkuController.update);

/**
 * @route DELETE /api/skus/:id
 * @desc Eliminar un SKU
 * @access Admin/Super Admin
 */
router.delete('/:id', SkuController.delete);

/**
 * @route PUT /api/skus/:id/stock
 * @desc Actualizar inventario de un SKU
 * @access Admin/Super Admin
 */
router.put('/:id/stock', SkuController.updateStock); 

module.exports = router;
