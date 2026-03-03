const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const WebhookController = require('../controllers/webhook.controller');

/**
 * @route GET /api/payments/options
 * @desc Obtener opciones de pago disponibles (soporta query `currency`)
 * @access Público
 */
router.get('/options', PaymentController.getPaymentOptions);

/**
 * @route POST /api/payments/initiate
 * @desc Iniciar un proceso de pago
 * @access Privado
 */
router.post('/initiate', authenticate, PaymentController.initiatePayment);

/**
 * @route GET /api/payments/admin/gateways
 * @desc Obtener pasarelas de pago configuradas
 * @access Admin
 */
router.get('/admin/gateways', authenticate, PaymentController.getAllGateways);

/**
 * @route PUT /api/payments/admin/gateways/:id
 * @desc Actualizar configuración de una pasarela de pago
 * @access Admin
 */
router.put('/admin/gateways/:id', authenticate, PaymentController.updateGateway);

/**
 * @route GET /api/payments/admin/gateways/currency-support
 * @desc Obtener soporte de monedas por pasarela
 * @access Admin
 */
router.get('/admin/gateways/currency-support', authenticate, PaymentController.getCurrencySupport);

/**
 * @route POST /api/payments/admin/gateways/currency-support
 * @desc Actualizar soporte de monedas por pasarela
 * @access Admin
 */
router.post('/admin/gateways/currency-support', authenticate, PaymentController.updateCurrencySupport);

/**
 * @route POST /api/payments/webhooks/:gatewaySlug
 * @desc Recibir eventos de webhook desde pasarelas de pago
 * @access Público (Verifica firmas de la pasarela)
 */
router.post('/webhooks/:gatewaySlug', WebhookController.handleWebhook);

module.exports = router;
