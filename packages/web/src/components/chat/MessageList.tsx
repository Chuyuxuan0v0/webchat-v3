import { useEffect, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useChatStore } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';

export default function MessageList() {
  const { messages, isLoading, hasMore, loadMoreMessages, activeChat } = useChatStore();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const prevChatIdRef = useRef<string | null>(null);
  const messagesCount = messages.length;
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // When switching chats, scroll to bottom immediately
  useEffect(() => {
    const chatId = activeChat?.id ?? null;
    if (chatId !== prevChatIdRef.current) {
      prevChatIdRef.current = chatId;
      // Use timeout to let Virtuoso render first
      setTimeout(() => {
        if (messagesCount > 0) {
          virtuosoRef.current?.scrollToIndex({
            index: messagesCount - 1,
            align: 'end',
            behavior: 'auto',
          });
        }
      }, 0);
    }
  }, [activeChat?.id, messagesCount]);

  // Auto-scroll to bottom when new messages arrive (if user is near bottom)
  useEffect(() => {
    if (messagesCount > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: messagesCount - 1,
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [messagesCount]);

  // Load more messages when scrolling to top
  const handleTopReached = () => {
    if (hasMore && !isLoading) {
      loadMoreMessages();
    }
  };

  // Manual scroll to bottom
  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: messagesCount - 1,
      align: 'end',
      behavior: 'smooth',
    });
    setShowScrollBtn(false);
  };

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-surface-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        computeItemKey={(index, item) => item._id}
        initialTopMostItemIndex={Math.max(0, messagesCount - 1)}
        followOutput="auto"
        startReached={handleTopReached}
        itemContent={(_index, message) => (
          <div className="px-4 py-1.5">
            <MessageBubble message={message} />
          </div>
        )}
        components={{
          Header: () =>
            hasMore ? (
              <div className="flex justify-center py-2">
                <button
                  onClick={loadMoreMessages}
                  disabled={isLoading}
                  className="text-sm text-primary-500 hover:text-primary-600 disabled:text-surface-400 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {isLoading ? '加载中...' : '加载更多'}
                </button>
              </div>
            ) : null,
        }}
      />

      {/* Scroll to bottom button for group chats */}
      {showScrollBtn && activeChat?.type === 'group' && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 bg-primary-500 text-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors duration-200 z-10"
          title="回到底部"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
}
