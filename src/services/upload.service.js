const cloudinary = require('cloudinary').v2;

// Configuración global de Cloudinary usando variables de entorno

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

class UploadService {
  
  /**
   * Sube un archivo (buffer) a Cloudinary.
   * @param {Buffer} buffer - Contenido del archivo
   * @param {string} folder - Carpeta destino en Cloudinary (ej: 'productos')
   * @returns {Promise<string>} URL segura de la image subida
   */
  async uploadImage(buffer, folder = 'general') {
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
}

module.exports = new UploadService();
