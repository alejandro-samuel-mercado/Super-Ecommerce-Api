const ProductService = require('../services/product.service');
const { ensureAbsoluteUrl } = require('../utils/url.util');

const mapProductUrls = (product, req) => {
  if (!product) return product;
  const p = { ...product };
  if (p.images && Array.isArray(p.images)) {
    p.images = p.images.map(url => ensureAbsoluteUrl(url, req));
  }
  if (p.octagonsImage) {
    p.octagonsImage = ensureAbsoluteUrl(p.octagonsImage, req);
  }
  return p;
};

class ProductController {

  async create(req, res, next) {
    try {
      const branchId = req.branchId;
      const product = await ProductService.createProduct({ ...req.body, adminId: req.user.id, ip: req.ip, branchId });
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
      const products = await ProductService.getProducts({ ...req.query, currency, branchId: req.branchId });
      const mappedProducts = { 
        ...products, 
        data: products.data.map(p => mapProductUrls(p, req)) 
      };
      res.status(200).json({ success: true, data: mappedProducts });
    } catch (error) {
      next(error); 
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const currency = req.headers['x-currency'] || req.query.currency;
      const branchId = req.branchId || req.query.branchId;
      const product = await ProductService.getProductById(id, currency, branchId);
      
      if (!product) return res.status(404).json({ success: false, message: 'Producto no encontrado' });

      res.status(200).json({ success: true, data: mapProductUrls(product, req) });
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
      
 
      const result = await ProductService.getProducts({ search: q, currency, branchId: req.branchId, ...req.query });
      const mappedResult = {
        ...result,
        data: result.data.map(p => mapProductUrls(p, req))
      };
      res.status(200).json({ success: true, data: mappedResult });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const branchId = req.branchId;
      const product = await ProductService.updateProduct(id, { ...req.body, adminId: req.user.id, ip: req.ip, branchId });
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
      const branchId = req.branchId;
      await ProductService.deleteProduct(id, req.user.id, req.ip, branchId);
      res.status(200).json({ success: true, message: 'Producto eliminado correctamente' });
    } catch (error) {
      if (error.message.includes('reservas activas') || error.message.includes('transferencia') || error.message.includes('ya fue eliminado')) {
         return res.status(409).json({ success: false, message: error.message });
      }
      if (error.message === 'Producto no encontrado') {
         return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async getRecommendations(req, res, next) {
    try {
      const { id } = req.params;
      const branchId = req.branchId;
      const currency = req.headers['x-currency'] || req.query.currency;
      const recommendations = await ProductService.getRecommendations(id, branchId, currency);
      
      const mapped = {
        related: (recommendations.related || []).map(p => mapProductUrls(p, req)),
        boughtTogether: (recommendations.boughtTogether || []).map(p => mapProductUrls(p, req))
      };

      res.status(200).json({ success: true, data: mapped });
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

  async bulkCreate(req, res, next) {
    try {
      const { products } = req.body;
      const branchId = req.branchId;
      
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ success: false, message: 'Se requiere un array de productos.' });
      }

      const result = await ProductService.bulkCreateProducts(products, {
        adminId: req.user.id,
        ip: req.ip,
        branchId
      });

      res.status(201).json({ 
        success: true, 
        message: `Importación finalizada: ${result.created} creados, ${result.errors.length} errores.`,
        data: result 
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController();
