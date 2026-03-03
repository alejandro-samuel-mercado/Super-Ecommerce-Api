const express = require('express');
const router = express.Router();
const controller = require('../controllers/auto-response.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

/**
 * @route POST /api/auto-responses
 * @desc Crear una nueva respuesta automática
 * @access Admin
 */
router.post('/', protect, restrictTo('ADMIN'), controller.createAutoResponse);

/**
 * @route GET /api/auto-responses
 * @desc Obtener todas las respuestas automáticas
 * @access Admin
 */
router.get('/', protect, restrictTo('ADMIN'), controller.getAutoResponses);

/**
 * @route PUT /api/auto-responses/:id
 * @desc Actualizar una respuesta automática existente
 * @access Admin
 */
router.put('/:id', protect, restrictTo('ADMIN'), controller.updateAutoResponse);

/**
 * @route DELETE /api/auto-responses/:id
 * @desc Eliminar una respuesta automática
 * @access Admin
 */
router.delete('/:id', protect, restrictTo('ADMIN'), controller.deleteAutoResponse);

module.exports = router;
