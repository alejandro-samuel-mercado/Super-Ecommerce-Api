const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/notifications
 * @desc Obtener notificaciones del usuario autenticado
 * @access Privado
 */
router.get('/', authenticate, NotificationController.getNotifications);

/**
 * @route PUT /api/notifications/:id/read
 * @desc Marcar notificación como leída
 * @access Privado
 */
router.put('/:id/read', authenticate, NotificationController.markAsRead);

/**
 * @route DELETE /api/notifications/:id
 * @desc Eliminar una notificación
 * @access Privado
 */
router.delete('/:id', authenticate, NotificationController.deleteNotification);

module.exports = router;
