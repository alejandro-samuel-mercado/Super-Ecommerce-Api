const express = require('express');
const router = express.Router();
const StockTransferController = require('../controllers/stock-transfer.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

// Rutas protegidas para administración de inventario
router.use(protect);

/**
 * @route GET /api/stock-transfers
 * @desc Obtener lista de transferencias de inventario
 * @access Privado
 */
router.get('/', StockTransferController.getAll);

/**
 * @route GET /api/stock-transfers/:id
 * @desc Obtener detalles de una transferencia de inventario
 * @access Privado
 */
router.get('/:id', StockTransferController.getOne);

/**
 * @route POST /api/stock-transfers
 * @desc Crear una nueva transferencia de inventario
 * @access Admin/Employee
 */
router.post('/', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), StockTransferController.create);

/**
 * @route PUT /api/stock-transfers/:id/ship
 * @desc Marcar transferencia como enviada
 * @access Admin/Employee
 */
router.put('/:id/ship', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), StockTransferController.ship);

/**
 * @route PUT /api/stock-transfers/:id/receive
 * @desc Marcar transferencia como recibida y actualizar stock en destino
 * @access Admin/Employee
 */
router.put('/:id/receive', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), StockTransferController.receive);

/**
 * @route PUT /api/stock-transfers/:id/cancel
 * @desc Cancelar una transferencia de inventario
 * @access Admin/Super Admin
 */
router.put('/:id/cancel', restrictTo('ADMIN', 'SUPER_ADMIN'), StockTransferController.cancel);

module.exports = router;
