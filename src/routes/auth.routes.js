const express = require('express');
const { body } = require('express-validator');
const { validateRequest } = require('../middlewares/validate.middleware');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const rateLimit = require('express-rate-limit');

// Limitador de tasa para Autenticación (Prevenir Fuerza Bruta)
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 20, // max 20 intentos por IP
    message: { success: false, message: 'Demasiados intentos de inicio de sesión, por favor intente más tarde.' }
});

/**
 * @route POST /api/auth/register
 * @desc Registrar un nuevo usuario
 * @access Público
 */
router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
    body('name').notEmpty().withMessage('El nombre es obligatorio'),
    validateRequest
  ],
  AuthController.register
);

/**
 * @route POST /api/auth/verify
 * @desc Verificar correo electrónico con código
 * @access Público
 */
router.post(
    '/verify',
    authLimiter,
    [
      body('email').isEmail().withMessage('Email inválido'),
      body('code').isLength({ min: 6, max: 6 }).withMessage('El código debe tener 6 dígitos'),
      validateRequest
    ],
    AuthController.verifyEmail
);

/**
 * @route POST /api/auth/resend-verify
 * @desc Reenviar código de verificación
 * @access Público
 */
router.post(
    '/resend-verify',
    authLimiter,
    [
      body('email').isEmail().withMessage('Email inválido'),
      validateRequest
    ],
    AuthController.resendVerificationCode
);

/**
 * @route POST /api/auth/login
 * @desc Iniciar sesión y obtener tokens
 * @access Público
 */
router.post('/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('Contraseña requerida'),
    validateRequest
  ],
  AuthController.login
);

const { protect } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/auth/me
 * @desc Obtener el perfil del usuario actual (autenticado)
 * @access Privado
 */
router.get('/me', protect, AuthController.getProfile);

/**
 * @route POST /api/auth/refresh
 * @desc Refrescar el token de acceso
 * @access Público
 */
router.post('/refresh', AuthController.refreshToken);

/**
 * @route POST /api/auth/logout
 * @desc Cerrar sesión del usuario
 * @access Público/Privado
 */
router.post('/logout', AuthController.logout);

/**
 * @route POST /api/auth/forgot
 * @desc Solicitar restablecimiento de contraseña
 * @access Público
 */
router.post('/forgot', authLimiter, [
    body('email').isEmail().withMessage('Email inválido'),
    validateRequest
], AuthController.forgotPassword);

/**
 * @route POST /api/auth/reset
 * @desc Restablecer contraseña con código de verificación
 * @access Público
 */
router.post('/reset', authLimiter, [
    body('email').isEmail().withMessage('Email inválido'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('El código debe tener 6 dígitos'),
    body('newPassword').isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres'),
    validateRequest
], AuthController.resetPassword);

/**
 * @route GET /api/auth/google
 * @desc Iniciar sesión con Google OAuth
 * @access Público
 */
router.get('/google', AuthController.googleLogin);

/**
 * @route GET /api/auth/google/callback
 * @desc Endpoint de retorno (callback) para Google OAuth
 * @access Público
 */
router.get('/google/callback', AuthController.googleCallback);

module.exports = router;
