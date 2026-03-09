const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blog.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/blog
 * @desc Obtener todas las publicaciones del blog
 * @access Público
 */
router.get('/', blogController.getPosts);

/**
 * @route GET /api/blog/tags
 * @desc Obtener todas las etiquetas del blog
 * @access Público
 */
router.get('/tags', blogController.getTags);

/**
 * @route GET /api/blog/:slug
 * @desc Obtener una publicación del blog por su slug
 * @access Público
 */
router.get('/:slug', blogController.getBySlug);

/**
 * @route GET /api/blog/:slug/related
 * @desc Obtener publicaciones relacionadas a una publicación específica
 * @access Público
 */
router.get('/:slug/related', blogController.getRelated);

// Rutas protegidas para gestión de contenido
router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']));

/**
 * @route POST /api/blog
 * @desc Crear una nueva publicación en el blog
 * @access Admin/Auth
 */
router.post('/', blogController.create);

/**
 * @route PUT /api/blog/:id
 * @desc Actualizar una publicación existente
 * @access Admin/Auth
 */
router.put('/:id', blogController.update);

/**
 * @route DELETE /api/blog/:id
 * @desc Eliminar una publicación del blog
 * @access Admin/Auth
 */
router.delete('/:id', blogController.delete);

module.exports = router;
