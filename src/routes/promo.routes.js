const { Router } = require('express');
const PromoController = require('../controllers/promo.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = Router();

// Todas las rutas promocionales requieren autenticación
router.use(protect);

/**
 * @route POST /api/promos/events
 * @desc Crear un nuevo evento promocional
 * @access Admin/Super Admin
 */
router.post('/events', restrictTo('ADMIN', 'SUPER_ADMIN'), PromoController.createEvent);

/**
 * @route GET /api/promos/events
 * @desc Obtener eventos promocionales
 * @access Admin/Employee
 */
router.get('/events', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), PromoController.getEvents);

/**
 * @route PUT /api/promos/events/:id
 * @desc Actualizar un evento promocional
 * @access Admin/Super Admin
 */
router.put('/events/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), PromoController.updateEvent);

/**
 * @route DELETE /api/promos/events/:id
 * @desc Eliminar un evento promocional
 * @access Admin/Super Admin
 */
router.delete('/events/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), PromoController.deleteEvent);

/**
 * @route POST /api/promos/discounts
 * @desc Crear una regla de descuento
 * @access Admin/Super Admin
 */
router.post('/discounts', restrictTo('ADMIN', 'SUPER_ADMIN'), PromoController.createDiscount);

/**
 * @route GET /api/promos/discounts
 * @desc Obtener reglas de descuento
 * @access Admin/Employee
 */
router.get('/discounts', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), PromoController.getDiscounts);

/**
 * @route DELETE /api/promos/discounts/:id
 * @desc Eliminar una regla de descuento
 * @access Admin/Super Admin
 */
router.delete('/discounts/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), PromoController.deleteDiscount);

/**
 * @route PUT /api/promos/discounts/:id
 * @desc Actualizar una regla de descuento
 * @access Admin/Super Admin
 */
router.put('/discounts/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), PromoController.updateDiscount);

module.exports = router;
