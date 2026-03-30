/**
 * Comprehensive Utility to sanitize and translate technical errors into human-friendly Spanish.
 */
function sanitizeErrorMessage(error) {
    if (!error) return 'Ha ocurrido un error inesperado.';

    let message = '';
    if (typeof error === 'string') {
        message = error;
    } else {
        // Collect message from common error properties
        message = error.message || error.response?.data?.message || '';
    }

    // 1. Mapping of specific technical markers to friendly phrases
    const directMappings = [
        { key: 'CURRENCY_NOT_SUPPORTED', msg: 'PayPal no soporta esta moneda Por favor use otro método.' },
        { key: 'INSTRUMENT_DECLINED', msg: 'El medio de pago fue rechazado. Verifique fondos o use otra tarjeta.' },
        { key: 'INSUFFICIENT_FUNDS', msg: 'Fondos insuficientes en la cuenta.' },
        { key: 'auto_return invalid', msg: 'Error de configuración en la pasarela de pago (MercadoPago).' },
        { key: 'back_url', msg: 'Error en el redireccionamiento del pago. Informe a soporte.' },
        { key: 'Insufficient stock', msg: 'No hay stock suficiente para uno de los productos.' },
        { key: 'P2002', msg: 'Este registro ya existe (dato duplicado).' },
        { key: 'P2003', msg: 'No se puede eliminar: el registro está siendo usado en otra parte.' },
        { key: 'ECONNREFUSED', msg: 'No se pudo conectar con el servicio. Intente más tarde.' },
        { key: 'ETIMEDOUT', msg: 'La conexión tardó demasiado tiempo.' },
        { key: 'UNAUTHORIZED', msg: 'Su sesión ha expirado. Por favor ingrese de nuevo.' }
    ];

    for (const mapping of directMappings) {
        if (message.includes(mapping.key)) return mapping.msg;
    }

    // 2. Handle the "Venta creada" pattern and strip everything after the colon
    if (message.includes('Venta creada')) {
        const match = message.match(/Venta creada \(#.*?\)/);
        const orderRef = match ? match[0] : 'Venta registrada';
        
        // Temporarily include original error to debug guest checkout
        const detailedError = message.split(':')[1] || '';
        return `${orderRef} con éxito, pero hubo un inconveniente: ${detailedError.trim()} \nRevise su email para continuar.`;
    }

    // 3. AGGRESSIVE STRIPPING of technical jargon
    // If it contains any of these, we replace the WHOLE message
    const technicalIndicators = [
        'Parser', 'SyntaxError', 'TypeError', 'ReferenceError', '{', '}', '"', ':',
        ' at ', 'node_modules', 'http/', 'Prisma', 'Constraint', 'Null', 'Undefined',
        'HttpError', 'Bad Request', 'Internal Server Error'
    ];

    if (technicalIndicators.some(term => message.includes(term))) {
        return 'Ocurrió un inconveniente técnico al procesar su solicitud. \nPor favor, intente nuevamente en unos instantes.';
    }

    // 4. Default Clean Up for short but technical-looking strings
    message = message.replace(/^Error:\s*/i, '')
        .replace(/^HttpError:\s*/i, '')
        .replace(/^PayPal Error:\s*/i, '')
        .replace(/^MP Error:\s*/i, '');

    // 5. Final Safety: Length and content check
    if (message.length > 120 || message.includes('\n') || message.includes('  ')) {
        return 'No se pudo completar la acción. Por favor contacte a soporte si el problema persiste.';
    }

    return message || 'Ha ocurrido un error inesperado al procesar la solicitud.';
}

module.exports = { sanitizeErrorMessage };
