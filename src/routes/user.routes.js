const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/users/profile
 * @desc Obtener el perfil del usuario autenticado
 * @access Privado
 */
router.get('/profile', authenticate, UserController.getProfile);

/**
 * @route PUT /api/users/profile
 * @desc Actualizar el perfil propio
 * @access Privado
 */
router.put('/profile', authenticate, UserController.updateProfile);

/**
 * @route GET /api/users/addresses
 * @desc Obtener direcciones guardadas
 * @access Privado
 */
router.get('/addresses', authenticate, UserController.getAddresses);

/**
 * @route POST /api/users/addresses
 * @desc Agregar una nueva dirección
 * @access Privado
 */
router.post('/addresses', authenticate, UserController.addAddress);

/**
 * @route DELETE /api/users/addresses/:id
 * @desc Eliminar una dirección guardada
 * @access Privado
 */
router.delete('/addresses/:id', authenticate, UserController.deleteAddress);

/**
 * @route GET /api/users/favorites
 * @desc Obtener lista de productos favoritos
 * @access Privado
 */
router.get('/favorites', authenticate, UserController.getFavorites);

/**
 * @route POST /api/users/favorites/:productId
 * @desc Marcar un producto como favorito
 * @access Privado
 */
router.post('/favorites/:productId', authenticate, UserController.addFavorite);

/**
 * @route DELETE /api/users/favorites/:productId
 * @desc Quitar un producto de los favoritos
 * @access Privado
 */
router.delete('/favorites/:productId', authenticate, UserController.removeFavorite);

/**
 * @route GET /api/users/points
 * @desc Ver historial de puntos de fidelidad
 * @access Privado
 */
router.get('/points', authenticate, UserController.getPointsHistory);

// Gestión de Usuarios (Admins & Empleados)
/**
 * @route GET /api/users
 * @desc Obtener todos los usuarios
 * @access Admin/Employee
 */
router.get('/', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), UserController.getAll);

/**
 * @route POST /api/users
 * @desc Crear usuario (manualmente por admin)
 * @access Admin/Employee
 */
router.post('/', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), UserController.createUser);

/**
 * @route PUT /api/users/:id
 * @desc Actualizar usuario administrativamente (rol, info, etc)
 * @access Admin/Employee
 */
router.put('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), UserController.updateUserAdmin);

/**
 * @route DELETE /api/users/:id
 * @desc Eliminar un usuario
 * @access Admin/Employee
 */
router.delete('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), UserController.deleteUser);

module.exports = router;
