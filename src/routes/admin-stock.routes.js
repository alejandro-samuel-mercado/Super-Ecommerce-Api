const express = require('express');
const router = express.Router();
const adminStockController = require('../controllers/admin-stock.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Todas las rutas requieren autenticación y rol de admin
router.use(authMiddleware.authenticate);

// router.use(authMiddleware.adminOnly);

/**
 * @route GET /api/admin/stock/reservations/stats
 * @desc Obtener estadísticas de reservas de stock
 * @access Admin
 */
router.get('/reservations/stats', adminStockController.getReservationStats);

/**
 * @route GET /api/admin/stock/reservations
 * @desc Obtener todas las reservas de stock activas
 * @access Admin
 */
router.get('/reservations', adminStockController.getActiveReservations);

/**
 * @route GET /api/admin/stock/inconsistencies
 * @desc Verificar inconsistencias de stock
 * @access Admin
 */
router.get('/inconsistencies', adminStockController.getStockInconsistencies);

/**
 * @route POST /api/admin/stock/cleanup
 * @desc Disparar manualmente limpieza de reservas de stock
 * @access Admin
 */
router.post('/cleanup', adminStockController.forceCleanup);

/**
 * @route GET /api/admin/stock/payment-transactions
 * @desc Obtener historial de transacciones de pago
 * @access Admin
 */
router.get('/payment-transactions', adminStockController.getPaymentTransactions);

/**
 * @route POST /api/admin/stock/reservations/:id/release
 * @desc Forzar liberación de una reserva específica
 * @access Admin
 */
router.post('/reservations/:id/release', adminStockController.releaseReservation);

/**
 * @route GET /api/admin/stock/inventory
 * @desc Obtener inventario por sucursal
 * @access Admin
 */
router.get('/inventory', adminStockController.getInventory);

/**
 * @route PUT /api/admin/stock/inventory/:id
 * @desc Actualizar stock/precio de inventario de sucursal
 * @access Admin
 */
router.put('/inventory/:id', adminStockController.updateInventory);

module.exports = router;
