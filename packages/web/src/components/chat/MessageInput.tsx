import { useState } from 'react';
import { useSocketStore } from '../../stores/socketStore';
import { useChatStore } from '../../stores/chatStore';
import FileUpload from './FileUpload';

export default function MessageInput() {
  const [message, setMessage] = useState('');
  const { sendMessage } = useSocketStore();
  const { activeChat } = useChatStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim() || !activeChat) return;

    sendMessage({
      chatId: activeChat.id,
      content: message.trim(),
      type: 'text',
      chatType: activeChat.type,
    });

    setMessage('');
  };

  return (
    <div className="p-4 border-t border-surface-200/60 bg-white/60 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <FileUpload type="image" />
        <FileUpload type="file" />
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="输入消息..."
            className="flex-1 px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-full focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 focus:bg-white outline-none transition-all duration-200"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-6 py-2 bg-primary-500 text-white rounded-full hover:bg-primary-600 active:bg-primary-700 focus:ring-4 focus:ring-primary-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
          >
            发送
          </button>
        </form>
      </div>
    </div>
  );
}
