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
  async getAllComments() {
      return await prisma.comment.findMany({
          include: { user: true, product: true },
          orderBy: { createdAt: 'desc' }
      });
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
