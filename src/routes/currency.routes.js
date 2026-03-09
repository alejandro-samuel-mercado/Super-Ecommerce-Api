const express = require('express');
const router = express.Router();
const CurrencyController = require('../controllers/currency.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/currencies
 * @desc Obtener todas las monedas
 * @access Público
 */
router.get('/', CurrencyController.getAll);

/**
 * @route GET /api/currencies/:code
 * @desc Obtener una moneda específica por código (ej: USD, BOB)
 * @access Público
 */
router.get('/:code', CurrencyController.getOne);

/**
 * @route POST /api/currencies
 * @desc Crear una nueva moneda
 * @access Super Admin
 */
router.post('/', authenticate, authorize(['SUPER_ADMIN']), CurrencyController.create);

/**
 * @route PUT /api/currencies/:id
 * @desc Actualizar una moneda existente
 * @access Super Admin
 */
router.put('/:id', authenticate, authorize(['SUPER_ADMIN']), CurrencyController.update);

/**
 * @route DELETE /api/currencies/:id
 * @desc Eliminar una moneda
 * @access Super Admin
 */
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN']), CurrencyController.delete);

module.exports = router;
