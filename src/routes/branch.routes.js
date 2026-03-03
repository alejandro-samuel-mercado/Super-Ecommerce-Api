const express = require('express');
const router = express.Router();
const BranchController = require('../controllers/branch.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/branches
 * @desc Obtener todas las sucursales
 * @access Público
 */
router.get('/', BranchController.getAll);

/**
 * @route GET /api/branches/:id
 * @desc Obtener una sucursal por ID
 * @access Público
 */
router.get('/:id', BranchController.getOne);

// Rutas protegidas (Administrador o Super Administrador)
router.use(protect);

/**
 * @route POST /api/branches
 * @desc Crear una nueva sucursal
 * @access Super Admin
 */
router.post('/', restrictTo('SUPER_ADMIN'), BranchController.create); 

/**
 * @route PUT /api/branches/:id
 * @desc Actualizar una sucursal existente
 * @access Super Admin/Admin
 */
router.put('/:id', restrictTo('SUPER_ADMIN', 'ADMIN'), BranchController.update);

/**
 * @route DELETE /api/branches/:id
 * @desc Eliminar una sucursal
 * @access Super Admin
 */
router.delete('/:id', restrictTo('SUPER_ADMIN'), BranchController.delete);

/**
 * @route GET /api/branches/:id/users
 * @desc Obtener usuarios de una sucursal
 * @access Super Admin/Admin
 */
router.get('/:id/users', restrictTo('SUPER_ADMIN', 'ADMIN'), BranchController.getUsers);

/**
 * @route POST /api/branches/:id/users
 * @desc Agregar un usuario a una sucursal
 * @access Super Admin
 */
router.post('/:id/users', restrictTo('SUPER_ADMIN'), BranchController.addUser);

/**
 * @route DELETE /api/branches/:id/users/:userId
 * @desc Eliminar un usuario de una sucursal
 * @access Super Admin
 */
router.delete('/:id/users/:userId', restrictTo('SUPER_ADMIN'), BranchController.removeUser);

module.exports = router;
