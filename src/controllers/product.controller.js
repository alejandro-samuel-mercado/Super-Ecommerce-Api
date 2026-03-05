const ProductService = require('../services/product.service');

class ProductController {

  async create(req, res, next) {
    try {
      const product = await ProductService.createProduct({ ...req.body, adminId: req.user.id, ip: req.ip });
      res.status(201).json({ success: true, message: 'Producto creado exitosamente', data: product });
    } catch (error) {
      if (error.code === 'P2002') {
         return res.status(409).json({ success: false, message: 'Conflicto: Se violó una restricción única.' });
      }
      next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const currency = req.headers['x-currency'] || req.query.currency;
      const products = await ProductService.getProducts({ ...req.query, currency });
      res.status(200).json({ success: true, data: products });
    } catch (error) {
      next(error); 
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const currency = req.headers['x-currency'] || req.query.currency;
      const product = await ProductService.getProductById(id, currency);
      
      if (!product) return res.status(404).json({ success: false, message: 'Producto no encontrado' });

      res.status(200).json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  }

  async search(req, res, next) {
    try {
      const { q } = req.query;
      const currency = req.headers['x-currency'] || req.query.currency;
      
      if (!q) {
        return res.status(400).json({ success: false, message: 'Parámetro de consulta requerido' });
      }
      
 
      const results = await ProductService.getProducts({ search: q, currency });
      res.status(200).json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const product = await ProductService.updateProduct(id, { ...req.body, adminId: req.user.id, ip: req.ip });
      res.status(200).json({ success: true, message: 'Producto actualizado exitosamente', data: product });
    } catch (error) {
      if (error.message === 'Product not found') {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      await ProductService.deleteProduct(id, req.user.id, req.ip);
      res.status(200).json({ success: true, message: 'Producto eliminado correctamente' });
    } catch (error) {
      if (error.message.includes('sales history')) {
         return res.status(409).json({ success: false, message: error.message });
      }
      if (error.message === 'Product not found') {
         return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async getRecommendations(req, res, next) {
    try {
      const { id } = req.params;
      const { branchId } = req.query;
      const currency = req.headers['x-currency'] || req.query.currency;
      const recommendations = await ProductService.getRecommendations(id, branchId, currency);
      res.status(200).json({ success: true, data: recommendations });
    } catch (error) {
      next(error);
    }
  }

  async updatePrices(req, res, next) {
    try {
      const { id } = req.params;
      const { prices } = req.body;
      const updatedPrices = await ProductService.updateProductPrices(id, prices);
      res.status(200).json({ success: true, data: updatedPrices });
    } catch (error) {
      next(error);
    }
  }

  async getPrices(req, res, next) {
    try {
      const { id } = req.params;
      const prices = await ProductService.getProductManualPrices(id);
      res.status(200).json({ success: true, data: prices });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController();
