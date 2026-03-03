const prisma = require('../config/prisma');

class LoggerService {
  
  /**
   * Registrar un error en la base de datos
   * @param {Error} error - El objeto de error
   * @param {Object} context - Contexto adicional (info req, usuario, etc)
   * @param {string} severity - LOW, MEDIUM, HIGH, CRITICAL
   */
  async log(error, context = {}, severity = 'MEDIUM') {
    try {
      const message = error.message || 'Error Desconocido';
      const stack = error.stack || '';
      const code = error.code || 'INTERNAL_ERROR';
      
      // Sanitizar Contexto
      const safeContext = this.sanitize(context);

      // Lógica de Agrupación: Verificar si el mismo error ocurrió recientemente (ej. últimos 15 min)
      // Buscamos mismo mensaje + mismo código + estado OPEN
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      
      const existingError = await prisma.errorLog.findFirst({
        where: {
          message: message,
          code: String(code),
          status: 'OPEN',
          updatedAt: { gt: fifteenMinutesAgo }
        }
      });

      if (existingError) {
        // Incrementar ocurrencias
        await prisma.errorLog.update({
          where: { id: existingError.id },
          data: { 
            occurrences: { increment: 1 },
            updatedAt: new Date()
          }
        });
        // Retornar referencia a ID existente
        return existingError.id;
      } else {
        // Crear nuevo registro
        const newLog = await prisma.errorLog.create({
          data: {
            severity,
            code: String(code),
            message,
            stack,
            context: safeContext,
            occurrences: 1
          }
        });
        return newLog.id;
      }

    } catch (loggingError) {
      // Si el registro falla, usar consola para no perderlo completamente
      // pero NO lanzar error para evitar romper el flujo principal
      console.error('FALLÓ EL REGISTRO DE ERROR EN DB:', loggingError);
      console.error('ERROR ORIGINAL:', error);
      return null;
    }
  }

  /**
   * Eliminar campos sensibles del contexto
   */
  sanitize(data) {
    if (!data) return {};
    const sensitiveKeys = ['password', 'creditCard', 'token', 'authorization', 'cookie'];
    
    // Copia profunda para evitar mutar la petición original
    const clean = JSON.parse(JSON.stringify(data));

    const sanitizeObject = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        } else if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
          obj[key] = '[REDACTED]';
        }
      }
    };

    sanitizeObject(clean);
    return clean;
  }
}

module.exports = new LoggerService();
