import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { chatService } from '../modules/chat/chat.service';
import { messageHandler } from './handlers/message.handler';
import { presenceHandler } from './handlers/presence.handler';

export const initializeSocket = (io: Server) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const secret = process.env.JWT_SECRET || 'default-secret';
      const decoded = jwt.verify(token, secret) as { id: string };

      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('User not found'));
      }

      (socket as any).userId = (user as any)._id.toString();
      (socket as any).username = user.username;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ${(socket as any).username} (${socket.id})`);

    messageHandler(io, socket);
    presenceHandler(io, socket);

    // Send all unread counts to the newly connected user
    const userId = (socket as any).userId;
    if (userId) {
      try {
        const counts = await chatService.getUnreadCounts(userId);
        socket.emit('unread:counts', counts);
      } catch (error) {
        console.error('Error loading unread counts:', error);
      }
    }

    // Handle mark-as-read from client
    socket.on('chat:markRead', async (data: { chatId: string; messageId: string }) => {
      try {
        const uid = (socket as any).userId;
        if (!uid) return;

        await chatService.markAsRead(uid, data.chatId, data.messageId);

        // Confirm with zero count
        socket.emit('unread:update', { chatId: data.chatId, count: 0 });
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    });

    socket.on('typing:start', (data) => {
      socket.broadcast.emit('typing:indicator', {
        chatId: data.chatId,
        userId: (socket as any).userId,
        username: (socket as any).username,
      });
    });

    socket.on('typing:stop', (data) => {
      socket.broadcast.emit('typing:indicator', {
        chatId: data.chatId,
        userId: (socket as any).userId,
        username: '',
      });
    });
  });
};
