const express = require('express');
const router = express.Router();
const CommentController = require('../controllers/comment.controller');

const { authenticate, authorize } = require('../middlewares/auth.middleware');

const { body, validationResult } = require('express-validator');

const validateComment = [
    body('content').trim().escape().notEmpty().withMessage('El contenido no puede estar vacío'),
    body('productId').optional({ nullable: true }).isInt().withMessage('ID de producto inválido'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Calificación debe estar entre 1 y 5'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }
];

/**
 * @route POST /api/comments
 * @desc Crear un nuevo comentario/reseña
 * @access Privado
 */
router.post('/', authenticate, validateComment, CommentController.create);

/**
 * @route GET /api/comments/my
 * @desc Obtener mis comentarios
 * @access Privado
 */
router.get('/my', authenticate, CommentController.getMyComments);

/**
 * @route GET /api/comments
 * @desc Obtener todos los comentarios
 * @access Admin/Employee
 */
router.get('/', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), CommentController.getAll);

/**
 * @route GET /api/comments/testimonials
 * @desc Obtener testimonios para la página de inicio
 * @access Público
 */
router.get('/testimonials', CommentController.getTestimonials);

/**
 * @route GET /api/comments/product/:productId
 * @desc Obtener comentarios por producto
 * @access Público
 */
router.get('/product/:productId', CommentController.getByProduct);

/**
 * @route PUT /api/comments/:id/moderate
 * @desc Moderar (aprobar/ocultar) un comentario
 * @access Admin/Employee
 */
router.put('/:id/moderate', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), CommentController.moderate); 

/**
 * @route DELETE /api/comments/:id
 * @desc Eliminar un comentario
 * @access Admin/Employee
 */
router.delete('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), CommentController.delete);

module.exports = router;
