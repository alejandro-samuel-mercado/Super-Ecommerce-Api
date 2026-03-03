const express = require('express');
const router = express.Router();
const CartController = require('../controllers/cart.controller');
const { protect } = require('../middlewares/auth.middleware');

// Todas las rutas del carrito requieren autenticación
router.use(protect);

/**
 * @route GET /api/cart
 * @desc Obtener el carrito actual del usuario
 * @access Privado
 */
router.get('/', CartController.getCart);

/**
 * @route POST /api/cart/add
 * @desc Añadir un artículo al carrito
 * @access Privado
 */
router.post('/add', CartController.addItem);

/**
 * @route POST /api/cart/update
 * @desc Actualizar la cantidad de un artículo en el carrito
 * @access Privado
 */
router.post('/update', CartController.updateItem);

/**
 * @route POST /api/cart/merge
 * @desc Fusionar carrito de invitado con carrito de usuario autenticado
 * @access Privado
 */
router.post('/merge', CartController.mergeCart);

/**
 * @route DELETE /api/cart/clear
 * @desc Vaciar el carrito completo
 * @access Privado
 */
router.delete('/clear', CartController.clearCart);

/**
 * @route DELETE /api/cart/:skuId
 * @desc Eliminar un artículo del carrito
 * @access Privado
 */
router.delete('/:skuId', CartController.removeItem);

module.exports = router;
