const CategoryService = require('../services/category.service');


/**
 * Controlador para gestionar las peticiones de Categorías.
 * Maneja respuestas HTTP estándar.
 */
class CategoryController {

  /**
   * GET /api/categories
   */
  async getAll(req, res, next) {
    try {
      const categories = await CategoryService.getAllCategories();
      res.status(200).json({
        success: true,
        data: categories
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/categories/tree
   * Retorna estructura jerárquica completa
   */
  async getTree(req, res, next) {
    try {
      const tree = await CategoryService.getCategoryTree();
      res.status(200).json({
        success: true,
        data: tree
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/categories/:id
   */
  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const category = await CategoryService.getCategoryById(id);
      
      if (!category) {
        return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
      }

      res.status(200).json({
        success: true,
        data: category
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/categories
   */
  async create(req, res, next) {
    try {
      const { name, description, slug, parentId } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, message: 'El name es obligatorio' });
      }
      const branchId = req.branchId;
      const newCategory = await CategoryService.createCategory({ name, description, slug, parentId, adminId: req.user.id, ip: req.ip, branchId });

      res.status(201).json({

        success: true,
        message: 'Categoría creada exitosamente',
        data: newCategory
      });
    } catch (error) {
      // Manejo simple de error de duplicados de Prisma (código P2002)
      if (error.message.includes('Ya existe')) {
          return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * PUT /api/categories/:id
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { name, description, slug, parentId } = req.body;
      const branchId = req.branchId;
      const updatedCategory = await CategoryService.updateCategory(id, { name, description, slug, parentId, adminId: req.user.id, ip: req.ip, branchId });

      res.status(200).json({

        success: true,
        message: 'Categoría actualizada',
        data: updatedCategory
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ success: false, message: 'Categoría no encontrada para actualizar' });
      }
      next(error);
    }
  }

  /**
   * DELETE /api/categories/:id
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const branchId = req.branchId;
      await CategoryService.deleteCategory(id, req.user.id, req.ip, branchId);

      res.status(200).json({

        success: true,
        message: 'Categoría eliminada correctamente'
      });
    } catch (error) {
       if (error.message.includes('No se puede eliminar')) {
        return res.status(409).json({ success: false, message: error.message });
      }
      if (error.code === 'P2025' || error.message === 'Categoría no encontrada') {
        return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
      }
      next(error);
    }
  }
}

module.exports = new CategoryController();
