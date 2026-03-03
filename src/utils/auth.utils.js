const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/** Constantes de configuración */
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRY = '7d';

class AuthUtils {

  async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }

  async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  generateTokens(userPayload) {
    const accessToken = jwt.sign(userPayload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = jwt.sign(userPayload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
    
    return { accessToken, refreshToken };
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, ACCESS_TOKEN_SECRET);
    } catch (error) {
      console.error('[AuthUtils] Error de verificación JWT:', error.message);
      throw new Error('Token inválido o expirado');
    }
  }

  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, REFRESH_TOKEN_SECRET);
    } catch (error) {
      throw new Error('Refresh Token inválido');
    }
  }

  /** Hash simple para guardar el refresh token en DB de forma segura */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Sanitizar usuario para enviar al cliente */
  sanitizeUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role ? { id: user.role.id, name: user.role.name } : null,
      points: user.points,
      dni: user.dni,
      phone: user.phone,
      address: user.address,
      branchId: user.branchId,
      status: user.status
    };
  }
}

module.exports = new AuthUtils();
