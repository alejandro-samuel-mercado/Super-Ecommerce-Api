const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/report.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

router.use(protect);

/**
 * @route GET /api/reports/financial
 * @desc Obtener reportes y estadísticas financieras
 * @access Admin/Super Admin
 */
router.get('/financial', restrictTo('SUPER_ADMIN', 'ADMIN'), ReportController.getFinancialStats);

/**
 * @route GET /api/reports/stock-valuation
 * @desc Obtener reporte de valuación de inventario
 * @access Admin/Super Admin
 */
router.get('/stock-valuation', restrictTo('SUPER_ADMIN', 'ADMIN'), ReportController.getStockValuation);

module.exports = router;
