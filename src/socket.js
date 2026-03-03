const socketIo = require('socket.io');
const chatService = require('./services/chat.service');
const jwt = require('jsonwebtoken');

let io;
// Rastrear sockets de admin
const adminSockets = new Set();

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: "*", 
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', async (socket) => {
    
    const token = socket.handshake.auth.token;
    let userId = null;
    let role = null;

    // Verificar Token manualmente ya que es conexión WS
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        role = decoded.role;
      } catch (err) {
      }
    }

    // Unir a salas basado en rol
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      socket.join('admins');
      adminSockets.add(socket.id);
    } 

    socket.on('join_conversation', async ({ conversationId }) => {
       if(role === 'ADMIN' || role === 'SUPER_ADMIN') {
           socket.join(`conversation_${conversationId}`);
       }
    });

    // Cliente inicia chat o envía mensaje
    socket.on('client_message', async ({ text }) => {
      try {
        // 1. Obtener o Crear Conversación
        const conversation = await chatService.getOrCreateConversation(userId, socket.id);
        const roomId = `conversation_${conversation.id}`;
        socket.join(roomId);

        // 2. Guardar Mensaje de Usuario
        await chatService.addMessage(conversation.id, 'USER', text);

        // 3. Lógica: Verificar si Admins están online
        const adminsOnline = adminSockets.size > 0;
        
        // Notificar Admins
        io.to('admins').emit('admin_notification', {
           type: 'new_message',
           conversationId: conversation.id,
           text,
           user: userId ? { id: userId } : { name: 'Invitado', email: 'Sin registrar' }
        });
        
        // Reenviar a la sala de conversación específica (para que admins observando la vean)
        socket.to(roomId).emit('message_received', {
            sender: 'USER',
            text,
            createdAt: new Date()
        });

        if (adminsOnline) {
          // Admin online: Quizás enviar mensaje "Espere un agente" si es conversación nueva?
          // Por ahora, directo: Admin lo ve en dashboard.
        } else {
          // No Admin online: Probar Auto-Respuesta
          const autoReply = await chatService.getAutoResponse(text);
          if (autoReply) {
             // Guardar Mensaje Bot
             await chatService.addMessage(conversation.id, 'BOT', autoReply);
             
             // Enviar a Cliente
             io.to(socket.id).emit('message_received', {
               conversationId: conversation.id, 
               sender: 'BOT',
               text: autoReply,
               createdAt: new Date()
             });
          } else {
             // Mensaje Bot de Respaldo
             const fallback = "Por el momento no hay agentes disponibles y no tengo una respuesta para eso. Dejanos tu email o intenta más tarde.";
             await chatService.addMessage(conversation.id, 'BOT', fallback);
             io.to(socket.id).emit('message_received', {
                conversationId: conversation.id,
                sender: 'BOT',
                text: fallback,
                 createdAt: new Date()
             });
          }
        }

      } catch (error) {
        console.error("Socket error client_message:", error);
      }
    });

    socket.on('typing', ({ conversationId }) => {
        // Broadcast a sala (Usuario o Admin)
        socket.to(`conversation_${conversationId}`).emit('display_typing', { sender: role === 'ADMIN' ? 'ADMIN' : 'USER' });
    });

    socket.on('stop_typing', ({ conversationId }) => {
        socket.to(`conversation_${conversationId}`).emit('hide_typing', { sender: role === 'ADMIN' ? 'ADMIN' : 'USER' });
    });

    socket.on('resume_chat', async ({ conversationId }) => {
        try {
            const conversation = await chatService.joinGuestConversation(conversationId, socket.id);
            if (conversation) {
                 const roomName = `conversation_${conversation.id}`;
                 socket.join(roomName);
                 
                 // Enviar historial a cliente
                 // Transformar mensajes si es necesario para coincidir { text, sender, createdAt }
                 const history = conversation.messages.map(m => ({
                     text: m.content,
                     sender: m.sender,
                     createdAt: m.createdAt
                 }));
                 
                 socket.emit('chat_history', { conversationId: conversation.id, messages: history });
            } else {
                // Si es inválido o cerrado, decir a cliente que limpie
                socket.emit('chat_history', { conversationId: null, messages: [] });
            }
        } catch (error) {
            console.error("Error resuming chat:", error);
        }
    });

    socket.on('admin_message', async ({ conversationId, text }) => {
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return;
      
      try {
        await chatService.addMessage(conversationId, 'ADMIN', text);
        
        const roomName = `conversation_${conversationId}`;
        const room = io.sockets.adapter.rooms.get(roomName);

        // Broadcast a todos en la sala (El Usuario + Otros Admins)
        io.to(roomName).emit('message_received', {
            sender: 'ADMIN',
            text,
            createdAt: new Date()
        });

      } catch (error) {
         console.error("Socket error admin_message:", error);
      }
    });

    socket.on('mark_read', ({ conversationId }) => {
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return;
      // Notificar a todos los admins para que sincronicen sus contadores
      io.to('admins').emit('mark_read', { conversationId });
    });

    socket.on('disconnect', () => {
      if (adminSockets.has(socket.id)) {
        adminSockets.delete(socket.id);
      }
    });
  });
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIo };
