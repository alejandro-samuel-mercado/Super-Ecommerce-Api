const rateLimit = require('express-rate-limit');

/**
 * Limitador global para toda la API
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 1000 , 
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Demasiadas peticiones. Por favor, espere unos minutos e intente de nuevo.'
    }
});

/**
 * Limitador estricto para Auth (Login/Register)
 */
const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    limit: process.env.NODE_ENV === 'development' ? 100 : 10, 
    message: {
        success: false,
        message: 'Demasiados intentos fallidos. Por seguridad, debe esperar 10 minutos para volver a intentarlo.'
    },
    skipSuccessfulRequests: true // No penalizar logins exitosos
});

module.exports = {
    apiLimiter,
    authLimiter
};
