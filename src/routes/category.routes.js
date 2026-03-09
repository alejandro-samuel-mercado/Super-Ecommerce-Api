const express = require('express');
const router = express.Router();
const CategoryController = require('../controllers/category.controller');

const { protect, restrictTo } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/categories
 * @desc Obtener todas las categorías
 * @access Público
 */
router.get('/', CategoryController.getAll);

/**
 * @route GET /api/categories/tree
 * @desc Obtener el árbol jerárquico de categorías
 * @access Público
 */
router.get('/tree', CategoryController.getTree);

/**
 * @route GET /api/categories/:id
 * @desc Obtener una categoría específica
 * @access Público
 */
router.get('/:id', CategoryController.getOne);

// Rutas protegidas (Admin/SuperAdmin)
router.use(protect);

/**
 * @route POST /api/categories
 * @desc Crear una nueva categoría
 * @access Admin/Employee
 */
router.post('/', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), CategoryController.create);

/**
 * @route PUT /api/categories/:id
 * @desc Actualizar una categoría existente
 * @access Admin/Employee
 */
router.put('/:id', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), CategoryController.update);

/**
 * @route DELETE /api/categories/:id
 * @desc Eliminar una categoría
 * @access Admin/Employee
 */
router.delete('/:id', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), CategoryController.delete);

module.exports = router;
