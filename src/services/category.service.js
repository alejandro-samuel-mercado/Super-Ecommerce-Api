const prisma = require('../config/prisma');

/**
 * Service para manejar la lógica de negocio de Categorías.
 * Desacopla la lógica de base de datos del controlador.
 */
class CategoryService {
  
  /**
   * Obtener todas las categorías (plana)
   * @returns {Promise<Array>} Lista de categorías
   */
  async getAllCategories() {
    return await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true } }
      }
    });
  }

  /**
   * Obtener árbol de categorías jerárquico (L1 -> L2 -> L3...)
   * @returns {Promise<Array>} Lista de categorías raíz con sus hijos anidados
   */
  async getCategoryTree() {
    const allCategories = await prisma.category.findMany({
      orderBy: {
        name: "asc", 
      },
      include: {
        _count: {
          select: {
            products: true
          }
        }
      }
    });

    // Construir árbol en memoria
    const categoryMap = new Map();
    const roots = [];

    // 1. Inicializar mapa
    allCategories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // 2. Asociar hijos a padres
    allCategories.forEach(cat => {
      if (cat.parentId) {
        const parent = categoryMap.get(cat.parentId);
        if (parent) {
          parent.children.push(categoryMap.get(cat.id));
        }
      } else {
        roots.push(categoryMap.get(cat.id));
      }
    });

    return roots;
  }

  /**
   * Obtener una categoría por ID
   * @param {number} id 
   * @returns {Promise<Object>} Categoría encontrada
   */
  async getCategoryById(id) {
    return await prisma.category.findUnique({
      where: { id: parseInt(id) },
      include: { products: true }
    });
  }

  /**
   * Crear nueva categoría
   * @param {Object} data - { name, descripcion }
   * @returns {Promise<Object>} Categoría creada
   */
  async createCategory(data) {
    // Validar si slug ya existe si se proporciona, o manejar lógica de unicidad
    const existing = await prisma.category.findUnique({
        where: { slug: data.slug } 
    });
    
    return await prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug, 
        description: data.description,
        parentId: data.parentId || null
      }
    });
  }

  /**
   * Actualizar categoría
   * @param {number} id 
   * @param {Object} data 
   * @returns {Promise<Object>}
   */
  async updateCategory(id, data) {
    return await prisma.category.update({
      where: { id: parseInt(id) },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        parentId: data.parentId !== undefined ? data.parentId : undefined
      }
    });
  }

  /**
   * Eliminar categoría
   * @param {number} id 
   * @returns {Promise<Object>}
   */
  async deleteCategory(id) {
    // Validar si tiene productos asociados antes de borrar
    const category = await prisma.category.findUnique({
        where: { id: parseInt(id) },
        include: { _count: { select: { products: true } } }
    });

    if (!category) throw new Error('Categoría no encontrada');
    if (category._count.products > 0) {
        throw new Error('No se puede eliminar una categoría que tiene productos asociados.');
    }

    return await prisma.category.delete({
      where: { id: parseInt(id) }
    });
  }
}

module.exports = new CategoryService();
