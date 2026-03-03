const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/chat/conversations
 * @desc Obtener conversaciones de chat abiertas
 * @access Admin/Employee
 */
router.get('/conversations', protect, restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), chatController.getOpenConversations);

/**
 * @route GET /api/chat/conversations/:id
 * @desc Obtener chat por ID de conversación
 * @access Admin/Employee
 */
router.get('/conversations/:id', protect, restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), chatController.getConversationById);

/**
 * @route POST /api/chat/conversations/:id/read
 * @desc Marcar conversación como leída
 * @access Admin/Employee
 */
router.post('/conversations/:id/read', protect, restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), chatController.markAsRead);

module.exports = router;
