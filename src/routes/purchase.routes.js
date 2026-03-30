const express = require('express');
const router = express.Router();
const PurchaseController = require('../controllers/purchase.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

// Proteger todas las rutas de compras a proveedores
router.use(protect);
router.use(restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'));

/**
 * @route GET /api/purchases
 * @desc Obtener lista de órdenes de compra
 * @access Privado (Requiere autenticación)
 */
router.get('/', PurchaseController.getAll);

/**
 * @route GET /api/purchases/:id
 * @desc Obtener detalles de una orden de compra
 * @access Privado (Requiere autenticación)
 */
router.get('/:id', PurchaseController.getById);

// Acciones restringidas (Solo Admin/SuperAdmin)
router.use(restrictTo('ADMIN', 'SUPER_ADMIN'));

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @route POST /api/purchases
 * @desc Crear una nueva orden de compra
 * @access Admin/Super Admin
 */
router.post('/', upload.single('invoice'), PurchaseController.create);

/**
 * @route POST /api/purchases/:id/confirm
 * @desc Confirmar una orden de compra (enviar al proveedor)
 * @access Admin/Super Admin
 */
router.post('/:id/confirm', PurchaseController.confirm);

/**
 * @route POST /api/purchases/:id/receive
 * @desc Recibir ítems de una orden de compra y actualizar inventario
 * @access Admin/Super Admin
 */
router.post('/:id/receive', PurchaseController.receive);

/**
 * @route POST /api/purchases/:id/cancel
 * @desc Cancelar una orden de compra
 * @access Admin/Super Admin
 */
router.post('/:id/cancel', PurchaseController.cancel);

module.exports = router;
