const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Check if Cloudinary is fully configured
const isCloudinaryConfigured = 
  process.env.UPLOAD_STORAGE !== 'local' &&
  process.env.CLOUDINARY_CLOUD_NAME?.trim().length > 0 && 
  process.env.CLOUDINARY_API_KEY?.trim().length > 0 && 
  process.env.CLOUDINARY_API_SECRET?.trim().length > 0;

console.log(`[UploadService] Modo de almacenamiento: ${isCloudinaryConfigured ? 'Cloudinary' : 'Local'}`);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

class UploadService {
   /**
   * Sube una imagen (buffer) a Cloudinary o almacenamiento local.
   * @param {Buffer} buffer - Contenido del archivo
   * @param {string} folder - Carpeta destino (ej: 'productos')
   * @param {string} baseUrl - (Opcional) Base URL para prefijar si es local (ej: 'https://api.com')
   * @returns {Promise<string>} URL o Path de la imagen subida
   */
  async uploadImage(buffer, folder = 'general', baseUrl = null) {
    if (isCloudinaryConfigured) {
      return this.uploadToCloudinary(buffer, folder);
    } else {
      const localPath = await this.uploadToLocal(buffer, folder);
      if (baseUrl && localPath.startsWith('/')) {
        return `${baseUrl}${localPath}`;
      }
      return localPath;
    }
  }

  async uploadToCloudinary(buffer, folder) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: folder, resource_type: 'auto' },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

  async uploadToLocal(buffer, folder) {
    try {
      const rootDir = path.resolve(__dirname, '../../');
      const uploadDir = path.join(rootDir, 'public/uploads', folder);
      
      console.log(`[UploadService] Intentando guardar localmente en: ${uploadDir}`);

      // Ensure directory exists
      if (!fs.existsSync(uploadDir)) {
        console.log(`[UploadService] Creando directorio: ${uploadDir}`);
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Generate unique filename
      const hash = crypto.randomBytes(8).toString('hex');
      const filename = `${Date.now()}-${hash}.jpg`; 
      const filePath = path.join(uploadDir, filename);

      return new Promise((resolve, reject) => {
        fs.writeFile(filePath, buffer, (err) => {
          if (err) {
            console.error(`[UploadService] Error al escribir archivo: ${err.message}`);
            return reject(err);
          }
          const relativePath = `/uploads/${folder}/${filename}`;
          console.log(`[UploadService] Archivo guardado con éxito: ${relativePath}`);
          resolve(relativePath);
        });
      });
    } catch (error) {
      console.error(`[UploadService] Error crítico en uploadToLocal: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new UploadService();
