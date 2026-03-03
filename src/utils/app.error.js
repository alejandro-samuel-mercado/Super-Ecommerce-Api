class AppError extends Error {
  constructor(message, statusCode, errorCode = 'OPERATIONAL_ERROR') {
    super(message);
    this.statusCode = statusCode || 500;
    this.errorCode = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
