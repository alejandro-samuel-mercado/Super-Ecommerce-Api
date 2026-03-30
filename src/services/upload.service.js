const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Check if Cloudinary is fully configured
const isCloudinaryConfigured = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

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
    const uploadDir = path.join(__dirname, '../../public/uploads', folder);
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `${Date.now()}-${hash}.jpg`; // Defaulting to jpg for simplicity, or we could detect mime type
    const filePath = path.join(uploadDir, filename);

    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, buffer, (err) => {
        if (err) return reject(err);
        // Return relative path for the frontend
        resolve(`/uploads/${folder}/${filename}`);
      });
    });
  }
}

module.exports = new UploadService();
