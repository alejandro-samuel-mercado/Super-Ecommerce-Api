/**
 * Valida si un código es un EAN-13 válido
 * @param {string} code 
 * @returns {boolean}
 */
const validateEAN13 = (code) => {
    if (!code || code.length !== 13 || !/^\d+$/.test(code)) return false;

    const digits = code.split('').map(Number);
    const checkDigit = digits.pop();

    const sum = digits.reduce((acc, digit, index) => {
        /**
         * Posiciones pares multiplicadas por 3
         * Posiciones impares multiplicadas por 1
         * Estándares EAN: De derecha a izquierda.
         */
        const weight = index % 2 === 0 ? 1 : 3;
        return acc + (digit * weight);
    }, 0);

    const calculatedCheckDigit = (10 - (sum % 10)) % 10;
    
    return checkDigit === calculatedCheckDigit;
};

/**
 * Genera un EAN-13 válido a partir de un prefijo y una secuencia
 * @param {string} prefix - Prefijo de 6 dígitos (ej: 779999)
 * @param {number} sequence - Secuencia numérica
 * @returns {string} Código EAN-13 completo
 */
const generateEAN13 = (prefix, sequence) => {
    /**
     * Formato: PPPPPPP SSSSS C
     * Prefijo: 6 caracteres
     * Secuencia: 6 caracteres
     * Verificador: 1 caracter
     */
    const sequenceStr = sequence.toString().padStart(6, '0');
    const raw = `${prefix}${sequenceStr}`;
    
    if (raw.length !== 12) throw new Error('Longitud de prefijo+secuencia inválida para EAN-13');

    /** Calcular el verificador */
    const digits = raw.split('').map(Number);
    const sum = digits.reduce((acc, digit, index) => {
        const weight = index % 2 === 0 ? 1 : 3;
        return acc + (digit * weight);
    }, 0);

    const checkDigit = (10 - (sum % 10)) % 10;
    
    return `${raw}${checkDigit}`;
};

module.exports = { validateEAN13, generateEAN13 };
