const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/product.controller');
const CodeExportController = require('../controllers/code-export.controller');

const { protect, restrictTo } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/products
 * @desc Obtener la lista de productos
 * @access Público
 */
router.get('/', ProductController.getAll);

/**
 * @route GET /api/products/search
 * @desc Buscar productos por texto / terminos
 * @access Público
 */
router.get('/search', ProductController.search);

/**
 * @route GET /api/products/:id
 * @desc Obtener un producto específico por ID o SKU
 * @access Público
 */
router.get('/:id', ProductController.getOne);

/**
 * @route GET /api/products/:id/recommendations
 * @desc Obtener recomendaciones basadas en el producto
 * @access Público
 */
router.get('/:id/recommendations', ProductController.getRecommendations);

// Rutas protegidas
router.use(protect);

/**
 * @route POST /api/products/export-codes
 * @desc Exportar códigos de barras/QRs en un PDF
 * @access Admin/Super Admin
 */
router.post('/export-codes', restrictTo('ADMIN', 'SUPER_ADMIN'), CodeExportController.generateCodesPDF);

/**
 * @route POST /api/products
 * @desc Crear un nuevo producto
 * @access Admin/Super Admin
 */
router.post('/', restrictTo('ADMIN', 'SUPER_ADMIN'), ProductController.create);

/**
 * @route PUT /api/products/:id
 * @desc Actualizar un producto existente
 * @access Admin/Super Admin
 */
router.put('/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), ProductController.update);

/**
 * @route DELETE /api/products/:id
 * @desc Eliminar un producto
 * @access Admin/Super Admin
 */
router.delete('/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), ProductController.delete);

/**
 * @route GET /api/products/:id/prices
 * @desc Obtener historial o lista de precios manuales
 * @access Admin/Super Admin
 */
router.get('/:id/prices', restrictTo('ADMIN', 'SUPER_ADMIN'), ProductController.getPrices);

/**
 * @route PUT /api/products/:id/prices
 * @desc Actualizar precios manuales
 * @access Admin/Super Admin
 */
router.put('/:id/prices', restrictTo('ADMIN', 'SUPER_ADMIN'), ProductController.updatePrices);

module.exports = router;
