import { create } from 'zustand';
import { Socket } from 'socket.io-client';
import { Message } from '@webchat/shared';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useChatStore } from './chatStore';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;

  connect: (token: string) => void;
  disconnect: () => void;
  sendMessage: (data: {
    chatId: string;
    content: string;
    type: 'text' | 'image' | 'file';
    chatType: 'group' | 'private';
    fileUrl?: string;
    fileName?: string;
  }) => void;
  markAsRead: (chatId: string, messageId: string) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connect: (token) => {
    const socket = connectSocket(token);

    socket.on('connect', () => {
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('message:receive', (message: Message) => {
      const chatStore = useChatStore.getState();
      const { activeChat } = chatStore;

      // Add message to chat if it belongs to active chat
      chatStore.addMessage(message);

      // If message is for a non-active chat, increment unread count
      if (!activeChat || message.chatId !== activeChat.id) {
        chatStore.incrementUnread(message.chatId);
      }
    });

    socket.on('user:online', (data) => {
      useChatStore.getState().addOnlineUser(data);
    });

    socket.on('user:offline', (data) => {
      useChatStore.getState().removeOnlineUser(data.userId);
    });

    // Unread events
    socket.on('unread:counts', (counts: Record<string, number>) => {
      useChatStore.getState().setUnreadCounts(counts);
    });

    socket.on('unread:update', ({ chatId, count }: { chatId: string; count: number }) => {
      useChatStore.getState().updateUnreadCount(chatId, count);
    });

    set({ socket });
  },

  disconnect: () => {
    disconnectSocket();
    set({ socket: null, isConnected: false });
  },

  sendMessage: (data) => {
    const { socket } = get();
    if (socket) {
      socket.emit('message:send', data);
    }
  },

  markAsRead: (chatId, messageId) => {
    const { socket } = get();
    if (socket) {
      socket.emit('chat:markRead', { chatId, messageId });
      useChatStore.getState().clearUnread(chatId);
    }
  },
}));
