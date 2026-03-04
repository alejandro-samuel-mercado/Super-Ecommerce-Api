const express = require('express');
const router = express.Router();
const SupplierPaymentController = require('../controllers/supplier-payment.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

router.use(protect);
router.use(restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'));

/**
 * @route GET /api/supplier-payments
 * @desc Obtener lista de pagos a proveedores
 * @access Privado
 */
router.get('/', SupplierPaymentController.getAll);

/**
 * @route POST /api/supplier-payments
 * @desc Registrar un nuevo pago a proveedor
 * @access Privado
 */
router.post('/', SupplierPaymentController.create);

module.exports = router;
