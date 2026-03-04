const prisma = require('../config/prisma');

class ChatService {
  /**
   * Crear o recuperar la conversacion de un usuario
   */
  async getOrCreateConversation(userId, socketId) {
    if (userId) {
      const existing = await prisma.chatConversation.findFirst({
        where: { userId, closed: false },
        include: { messages: true },
      });

      if (existing) {
        if (existing.socketId !== socketId) {
          await prisma.chatConversation.update({
            where: { id: existing.id },
            data: { socketId },
          });
        }
        return existing;
      }
    } else {
        
        const existingGuest = await prisma.chatConversation.findFirst({
            where: { socketId, closed: false }, 
            include: { messages: true },
        });
        if (existingGuest) return existingGuest;
    }

    // Crear nueva conversacion
    return await prisma.chatConversation.create({
      data: {
        userId,
        socketId,
        messages: {
          create: {
            sender: 'BOT',
            content: '¡Hola! ¿En qué puedo ayudarte hoy?',
          },
        },
      },
      include: { messages: true },
    });
  }

  /**
   * Reconectar al invitiado
   */
  async joinGuestConversation(conversationId, newSocketId) {
      const conversation = await prisma.chatConversation.findUnique({
          where: { id: conversationId },
          include: { messages: true }
      });

      if (!conversation) return null;
      if (conversation.closed) return null; 
      await prisma.chatConversation.update({
          where: { id: conversationId },
          data: { socketId: newSocketId }
      });
      
      return conversation;
  }

  /**
   * Guardar mensajes en la bd
   */
  async addMessage(conversationId, sender, content) {
    return await prisma.chatMessage.create({
      data: {
        conversationId,
        sender,
        content,
      },
    });
  }

  /**
   * Respuestas automaticas con palabras clave
   */
  async getAutoResponse(content) {
    const lowerContent = content.toLowerCase();

    const responses = await prisma.chatAutoResponse.findMany({
      where: { isActive: true },
    });

    for (const r of responses) {
      if (!r.trigger) continue;
      if (lowerContent.includes(r.trigger.toLowerCase())) {
        return r.response;
      }
    }

    return null;
  }

  /**
   * Retornar las activas para Admin
   */
  async getOpenConversations() {
    const conversations = await prisma.chatConversation.findMany({
      where: { closed: false },
      include: { 
        user: {
          select: { name: true, email: true }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        _count: {
          select: { 
            messages: { 
              where: { 
                read: false, 
                sender: 'USER' 
              } 
            } 
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
    });
    
    // Transformar para el formato del frontend
    return conversations.map(c => ({
        ...c,
        unread: c._count.messages
    }));
  }

  async getConversationById(id) {
    return await prisma.chatConversation.findUnique({
      where: { id },
      include: { 
        messages: {
            orderBy: { createdAt: 'asc' }
        },
        user: {
            select: { name: true, email: true }
        }
      }
    });
  }

  async markAsRead(id) {
    return await prisma.chatMessage.updateMany({
      where: { 
        conversationId: parseInt(id),
        sender: 'USER',
        read: false
      },
      data: { read: true }
    });
  }
}

module.exports = new ChatService();
