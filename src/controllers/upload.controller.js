const UploadService = require('../services/upload.service');

class UploadController {
  
  async uploadFile(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No se envió ningún archivo' });
      }

      const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      const url = await UploadService.uploadImage(req.file.buffer, req.body.folder || 'productos', baseUrl);

      res.status(201).json({
        success: true,
        data: { url }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UploadController();
