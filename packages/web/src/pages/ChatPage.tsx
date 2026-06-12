import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useSocketStore } from '../stores/socketStore';
import Sidebar from '../components/chat/Sidebar';
import ChatWindow from '../components/chat/ChatWindow';

export default function ChatPage() {
  const { token } = useAuthStore();
  const { setActiveChat, loadOnlineUsers, activeChat, messages } = useChatStore();
  const { connect, disconnect, markAsRead } = useSocketStore();

  useEffect(() => {
    if (token) {
      connect(token);
      loadOnlineUsers();
      setActiveChat({ id: 'global', type: 'group', name: '聊天大厅' });
    }

    return () => {
      disconnect();
    };
  }, [token]);

  // Mark as read when entering a chat (after messages are loaded)
  useEffect(() => {
    if (activeChat && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      markAsRead(activeChat.id, latestMessage._id);
    }
  }, [activeChat?.id]);

  return (
    <div className="h-screen flex bg-surface-50">
      <Sidebar
        onSelectChat={setActiveChat}
        activeChatId={activeChat?.id}
      />
      <ChatWindow />
    </div>
  );
}
