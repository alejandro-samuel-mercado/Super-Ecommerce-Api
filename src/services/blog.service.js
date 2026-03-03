const prisma = require('../config/prisma');

class BlogService {

  async getPosts({ page = 1, limit = 12, tag, search, published = true } = {}) {
    const where = {};
    
    if (published !== undefined) {
      where.published = published;
    }
    
    if (tag) {
      where.tags = { has: tag };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.blogPost.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBySlug(slug) {
    const post = await prisma.blogPost.findUnique({ where: { slug } });
    if (!post) throw { status: 404, message: 'Post no encontrado' };
    return post;
  }

  async getTags() {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      select: { tags: true },
    });
    
    const tagSet = new Set();
    posts.forEach(p => p.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }

  async getRelated(slug, limit = 3) {
    const post = await prisma.blogPost.findUnique({ where: { slug }, select: { tags: true, id: true } });
    if (!post) return [];

    return prisma.blogPost.findMany({
      where: {
        published: true,
        id: { not: post.id },
        tags: { hasSome: post.tags },
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  }

  async create(data) {
    // Auto generar slug si no se provee
    if (!data.slug) {
      data.slug = data.title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    if (data.published && !data.publishedAt) {
      data.publishedAt = new Date();
    }

    return prisma.blogPost.create({ data });
  }

  async update(id, data) {
    // Si publicamos por primera vez, seteamos publishedAt
    if (data.published && !data.publishedAt) {
      const existing = await prisma.blogPost.findUnique({ where: { id } });
      if (existing && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    return prisma.blogPost.update({ where: { id }, data });
  }

  async delete(id) {
    return prisma.blogPost.delete({ where: { id } });
  }
}

module.exports = new BlogService();
