const express = require('express');
const router = express.Router();
const CartController = require('../controllers/cart.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

router.use(protect);

router.get('/user/:userId', authorize('ADMIN', 'EMPLOYEE', 'SUPER_ADMIN'), CartController.getCartByUserId);

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
