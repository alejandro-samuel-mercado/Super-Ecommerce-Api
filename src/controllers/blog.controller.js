const blogService = require('../services/blog.service');

const blogController = {

  // GET /api/blog
  async getPosts(req, res, next) {
    try {
      const { page, limit, tag, search } = req.query;
      const result = await blogService.getPosts({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 12,
        tag,
        search,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/blog/tags
  async getTags(req, res, next) {
    try {
      const tags = await blogService.getTags();
      res.json(tags);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/blog/:slug
  async getBySlug(req, res, next) {
    try {
      const post = await blogService.getBySlug(req.params.slug);
      res.json(post);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/blog/:slug/related
  async getRelated(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 3;
      const posts = await blogService.getRelated(req.params.slug, limit);
      res.json(posts);
    } catch (err) {
      next(err);
    }
  },

  // POST /api/blog
  async create(req, res, next) {
    try {
      const post = await blogService.create(req.body);
      res.status(201).json({ message: 'Post creado exitosamente', ...post });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/blog/:id
  async update(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const post = await blogService.update(id, req.body);
      res.json({ message: 'Post actualizado exitosamente', ...post });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/blog/:id
  async delete(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      await blogService.delete(id);
      res.json({ message: 'Post eliminado exitosamente' });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = blogController;
