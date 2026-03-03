const CommentService = require('../services/comment.service');

class CommentController {

  async getAll(req, res, next) {
      try {
          const comments = await CommentService.getAllComments();
          res.json({ success: true, data: comments });
      } catch (error) {
          next(error);
      }
  }

  async create(req, res, next) {
    try {
      const comment = await CommentService.createComment({ ...req.body, userId: req.user.id });
      res.status(201).json({ success: true, message: 'Comentario enviado. Pendiente de aprobación.', data: comment });
    } catch (error) {
      next(error);
    }
  }

  async getByProduct(req, res, next) {
    try {
      const { productId } = req.params;
      const comments = await CommentService.getCommentsByProduct(productId);
      res.status(200).json({ success: true, data: comments });
    } catch (error) {
      next(error);
    }
  }

  async getTestimonials(req, res, next) {
    try {
      const { limit } = req.query;
      const testimonials = await CommentService.getTestimonials(limit ? parseInt(limit) : 12);
      res.status(200).json({ success: true, data: testimonials });
    } catch (error) {
      next(error);
    }
  }

  async moderate(req, res, next) {
      try {
          const { id } = req.params;
          const { approved } = req.body;
          const comment = await CommentService.moderateComment(id, approved);
          res.status(200).json({ success: true, message: 'Estado del comentario actualizado', data: comment });
      } catch (error) {
          next(error);
      }
  }

  async delete(req, res, next) {
      try {
          const { id } = req.params;
          await CommentService.deleteComment(id);
          res.status(200).json({ success: true, message: 'Comentario eliminado' });
      } catch (error) {
          if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
          next(error);
      }
  }

  async getMyComments(req, res, next) {
      try {
          const comments = await CommentService.getCommentsByUser(req.user.id);
          res.status(200).json({ success: true, data: comments });
      } catch (error) {
          next(error);
      }
  }
}

module.exports = new CommentController();
