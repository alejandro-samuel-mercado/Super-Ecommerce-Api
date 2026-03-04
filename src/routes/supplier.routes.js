const express = require('express');
const router = express.Router();
const SupplierController = require('../controllers/supplier.controller');
const { protect } = require('../middlewares/auth.middleware');

// Todas las rutas de proveedores requieren autenticación
router.use(protect);
router.use(require('../middlewares/auth.middleware').restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'));

/**
 * @route GET /api/suppliers
 * @desc Obtener todos los proveedores
 * @access Privado
 */
router.get('/', SupplierController.getAll);

/**
 * @route GET /api/suppliers/:id
 * @desc Obtener detalles de un proveedor
 * @access Privado
 */
router.get('/:id', SupplierController.getById);

/**
 * @route POST /api/suppliers
 * @desc Crear un nuevo proveedor
 * @access Admin/Super Admin
 */
router.post('/', SupplierController.create);

/**
 * @route PUT /api/suppliers/:id
 * @desc Actualizar un proveedor existente
 * @access Admin/Super Admin
 */
router.put('/:id', SupplierController.update);

/**
 * @route POST /api/suppliers/:id/skus
 * @desc Agregar un SKU al catálogo del proveedor
 * @access Privado
 */
router.post('/:id/skus', SupplierController.addSku);

/**
 * @route DELETE /api/suppliers/:id/skus/:skuId
 * @desc Eliminar un SKU del proveedor
 * @access Privado
 */
router.delete('/:id/skus/:skuId', SupplierController.removeSku);

module.exports = router;
