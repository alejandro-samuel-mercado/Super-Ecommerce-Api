const { Router } = require('express');
const { body } = require('express-validator');
const SaleController = require('../controllers/sale.controller');
const { protect, restrictTo, optionalProtect } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validate.middleware');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

const rateLimit = require('express-rate-limit');

// Limitador estricto para pagos para evitar abusos
const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    message: { success: false, message: 'Demasiados intentos de compra. Por favor, intente de nuevo en 15 minutos.' }
});

const router = Router();

// Rutas que requieren autenticación OPCIONAL (Invitados permitidos)
router.post('/preview', optionalProtect, SaleController.preview);

/**
 * @route POST /api/sales/checkout
 * @desc Procesar una venta / checkout
 * @access Público (Permite invitados)
 */
router.post('/checkout', optionalProtect, checkoutLimiter, [
    body('items').isArray({ min: 1 }).withMessage('El carrito debe contener al menos un artículo'),
    body('items.*.skuId').isInt().withMessage('ID de SKU inválido'),
    body('items.*.quantity').isNumeric().withMessage('La cantidad debe ser un número mayor a 0'),
    body('paymentType').isIn(['CASH', 'DEBIT', 'CARD', 'TRANSFER', 'MERCADO_PAGO', 'mercadopago', 'stripe', 'paypal', 'POINTS', 'QR', 'POINTS']).withMessage('Método de pago inválido'),
    body('deliveryType').isIn(['PICKUP', 'DELIVERY']).withMessage('Tipo de entrega inválido'),
    validateRequest
], SaleController.create);

// Todas las demás rutas de ventas requieren autenticación OBLIGATORIA
router.use(protect);

/**
 * @route GET /api/sales/my-purchases
 * @desc Obtener historial de compras del usuario autenticado
 * @access Privado (Cliente)
 */
router.get('/my-purchases', SaleController.getMySales);
router.get('/my-sales', SaleController.getMySales);

/**
 * @route GET /api/sales
 * @desc Listado de todas las ventas
 * @access Admin/Employee
 */
router.get('/', restrictTo(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), SaleController.getAll);

/**
 * @route GET /api/sales/:id
 * @desc Ver detalle de venta
 * @access Privado (Cliente propio o Admin/Empleado)
 */
router.get('/:id', SaleController.getOne);

/**
 * @route GET /api/sales/:id/invoice
 * @desc Descargar Factura PDF
 * @access Privado (Cliente propio o Admin/Empleado)
 */
router.get('/:id/invoice', SaleController.getInvoice);

/**
 * @route PUT /api/sales/:id
 * @desc Actualizar estado de una venta
 * @access Admin/Employee
 */
router.put('/:id', restrictTo(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), SaleController.update);

/**
 * @route POST /api/sales/:id/refund
 * @desc Anular venta (Refund)
 * @access Admin/Employee
 */
router.post('/:id/refund', restrictTo(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), SaleController.refund);

/**
 * @route POST /api/sales/:id/payment-proof
 * @desc Subir comprobante de pago
 * @access Privado (Dueño de la venta)
 */
router.post('/:id/payment-proof', upload.single('image'), SaleController.uploadPaymentProof);
router.delete('/:id/payment-proof', SaleController.deletePaymentProof);

/**
 * @route POST /api/sales/:id/qr-image
 * @desc Subir imagen QR de pago (Admin/Employee)
 * @access Admin/Employee
 */
router.post('/:id/qr-image', restrictTo(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), upload.single('image'), SaleController.uploadQrImage);

/**
 * @route DELETE /api/sales/:id/qr-image
 * @desc Eliminar imagen QR de pago (Admin/Employee)
 * @access Admin/Employee
 */
router.delete('/:id/qr-image', restrictTo(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), SaleController.deleteQrImage);

module.exports = router;
