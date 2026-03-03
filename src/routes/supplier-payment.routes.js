const express = require('express');
const router = express.Router();
const SupplierPaymentController = require('../controllers/supplier-payment.controller');
const { protect } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/supplier-payments
 * @desc Obtener lista de pagos a proveedores
 * @access Privado
 */
router.get('/', protect, SupplierPaymentController.getAll);

/**
 * @route POST /api/supplier-payments
 * @desc Registrar un nuevo pago a proveedor
 * @access Privado
 */
router.post('/', protect, SupplierPaymentController.create);

module.exports = router;
