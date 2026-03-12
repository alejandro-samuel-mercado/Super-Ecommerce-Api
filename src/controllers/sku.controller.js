const SkuService = require('../services/sku.service');

class SkuController {

  async create(req, res, next) {
    try {
        const sku = await SkuService.createSku(req.body);
        res.status(201).json({ success: true, message: 'SKU creado exitosamente', data: sku });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'El código de SKU ya existe.' });
        next(error);
    }
  }

  async findAll(req, res, next) {
      try {
          const skus = await SkuService.findAll(req.query);
          res.status(200).json({ success: true, data: skus });
      } catch (error) {
          next(error);
      }
  }

  async update(req, res, next) {
      try {
          const { id } = req.params;
          const sku = await SkuService.updateSku(id, req.body);
          res.status(200).json({ success: true, message: 'SKU actualizado', data: sku });
      } catch (error) {
          next(error);
      }
  }

  async delete(req, res, next) {
      try {
          const { id } = req.params;
          await SkuService.deleteSku(id);
          res.status(200).json({ success: true, message: 'SKU eliminado correctamente' });
      } catch (error) {
          return res.status(400).json({ success: false, message: error.message });
      }
  }

  async updateStock(req, res, next) {
    try {
      const { id } = req.params;
      const { quantity, operationType } = req.body;
      
      const updatedSku = await SkuService.updateStock(id, quantity, operationType);
      
      res.status(200).json({
        success: true,
        message: 'Stock actualizado correctamente',
        data: updatedSku
      });
    } catch (error) {
      if (error.message.includes('negativo')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }
}

module.exports = new SkuController();
