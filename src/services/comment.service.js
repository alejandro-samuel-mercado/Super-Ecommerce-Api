const prisma = require('../config/prisma');

class CommentService {
  
  /**
   * Crear un comentario
   */
  async createComment(data) {
    const { userId, productId, content, rating } = data;
    
    // Verificar producto solo si se proporciona productId (comentarios de producto)
    if (productId !== null && productId !== undefined) {
      const product = await prisma.product.findUnique({ where: { id: parseInt(productId) } });
      if (!product) throw new Error('Producto no encontrado');
    }

    return await prisma.comment.create({
      data: {
        userId: parseInt(userId),
        productId: productId ? parseInt(productId) : null,
        content,
        rating: rating || null,
        approved: false
      }
    });
  }

  /**
   * Obtener comentarios aprobados de un producto
   */
  async getCommentsByProduct(productId) {
    return await prisma.comment.findMany({
      where: { 
          productId: parseInt(productId),
          approved: true 
      },
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Obtener TODOS los comentarios (Admin)
   */
  async getAllComments(params = {}) {
      const { page = 1, limit = 20, search } = params;
      const p = Math.max(1, parseInt(page));
      const l = Math.max(1, parseInt(limit));
      const skip = (p - 1) * l;
      
      const where = {};
      if (search) {
          const searchTrim = search.trim();
          where.OR = [
              { content: { contains: searchTrim, mode: 'insensitive' } },
              { user: { name: { contains: searchTrim, mode: 'insensitive' } } },
              { user: { email: { contains: searchTrim, mode: 'insensitive' } } },
              { product: { name: { contains: searchTrim, mode: 'insensitive' } } }
          ];
      }

      const [comments, total] = await Promise.all([
          prisma.comment.findMany({
              where,
              include: { user: true, product: true },
              orderBy: { createdAt: 'desc' },
              skip,
              take: l
          }),
          prisma.comment.count({ where })
      ]);
      return { data: comments, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  /**
   * Aprobar/Rechazar comentario (Moderación)
   */
  async moderateComment(id, approved) {
      return await prisma.comment.update({
          where: { id: parseInt(id) },
          data: { approved: Boolean(approved) }
      });
  }

  /**
   * Obtener testimonios para homepage (comentarios aprobados con buena calificación)
   */
  async getTestimonials(limit = 12) {
    return await prisma.comment.findMany({
      where: {
        approved: true,
        rating: { gte: 4 }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileImage: true
          }
        },
        product: {
          select: {
            id: true,
            name: true,
            images: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  async deleteComment(id) {
      return await prisma.comment.delete({ where: { id: parseInt(id) } });
  }

  async getCommentsByUser(userId) {
      return await prisma.comment.findMany({
          where: { userId: parseInt(userId) },
          include: { product: true },
          orderBy: { createdAt: 'desc' }
      });
  }
}

module.exports = new CommentService();
