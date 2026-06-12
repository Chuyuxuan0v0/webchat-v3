# 布局修复 + 虚拟滚动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix layout so only the message list scrolls (Sidebar, ChatHeader, MessageInput stay fixed), and add virtual scrolling via react-virtuoso for performance with large message lists.

**Architecture:** Add `overflow-hidden` to ChatPage, Sidebar, and ChatWindow containers to enforce proper flex constraints. Replace MessageList's manual scroll container with react-virtuoso's `Virtuoso` component for virtualized rendering.

**Tech Stack:** React 19, Tailwind CSS 4, react-virtuoso

---

## File Structure

### Modified Files

| File                                               | Changes                                      |
| -------------------------------------------------- | -------------------------------------------- |
| `packages/web/package.json`                        | Add `react-virtuoso` dependency              |
| `packages/web/src/pages/ChatPage.tsx`              | Add `overflow-hidden` to root div            |
| `packages/web/src/components/chat/Sidebar.tsx`     | Add `overflow-hidden` + `h-full` to root div |
| `packages/web/src/components/chat/ChatWindow.tsx`  | Add `overflow-hidden` to root div            |
| `packages/web/src/components/chat/MessageList.tsx` | Replace manual scroll with Virtuoso          |

---

## Task 1: Install react-virtuoso

**Files:**

- Modify: `packages/web/package.json` (via pnpm)

- [ ] **Step 1: Install the dependency**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web add react-virtuoso`
Expected: Package installed successfully, `react-virtuoso` appears in `packages/web/package.json` dependencies.

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json packages/web/pnpm-lock.yaml
git commit -m "chore(web): add react-virtuoso dependency"
```

---

## Task 2: Fix Layout CSS — Enforce Fixed Sidebar, Header, Input

**Files:**

- Modify: `packages/web/src/pages/ChatPage.tsx`
- Modify: `packages/web/src/components/chat/Sidebar.tsx`
- Modify: `packages/web/src/components/chat/ChatWindow.tsx`

- [ ] **Step 1: Add overflow-hidden to ChatPage root div**

Open `packages/web/src/pages/ChatPage.tsx`. Change line 34:

Current:

```tsx
    <div className="h-screen flex bg-surface-50">
```

Replace with:

```tsx
    <div className="h-screen flex overflow-hidden bg-surface-50">
```

- [ ] **Step 2: Add overflow-hidden + h-full to Sidebar root div**

Open `packages/web/src/components/chat/Sidebar.tsx`. Change line 35:

Current:

```tsx
    <div className="w-64 bg-surface-50/80 backdrop-blur-sm border-r border-surface-200 flex flex-col">
```

Replace with:

```tsx
    <div className="w-64 h-full bg-surface-50/80 backdrop-blur-sm border-r border-surface-200 flex flex-col overflow-hidden">
```

- [ ] **Step 3: Add overflow-hidden to ChatWindow root div**

Open `packages/web/src/components/chat/ChatWindow.tsx`. Change line 7:

Current:

```tsx
    <div className="flex-1 flex flex-col bg-surface-50">
```

Replace with:

```tsx
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-50">
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/ChatPage.tsx packages/web/src/components/chat/Sidebar.tsx packages/web/src/components/chat/ChatWindow.tsx
git commit -m "fix(web): add overflow-hidden to layout containers, fix fixed sidebar/header/input"
```

---

## Task 3: Refactor MessageList — Replace with Virtuoso

**Files:**

- Modify: `packages/web/src/components/chat/MessageList.tsx`

- [ ] **Step 1: Read the current file**

Read `packages/web/src/components/chat/MessageList.tsx` to understand the current implementation.

- [ ] **Step 2: Replace the entire file content**

Replace the entire file with:

```tsx
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
            behavior: 'instant',
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

  // Track scroll state for "scroll to bottom" button (group chats)
  const handleScroll = () => {
    // Virtuoso doesn't directly expose scroll position in onScroll
    // We use a workaround: check if the first visible item is near the end
    // For group chats, show the button after user has been away from bottom
    // The followOutput="auto" handles auto-scrolling for new messages
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
        computeItemKey={(item) => item._id}
        initialTopMostItemIndex={Math.max(0, messagesCount - 1)}
        followOutput="auto"
        onTopReached={handleTopReached}
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/chat/MessageList.tsx
git commit -m "feat(web): replace MessageList scroll container with react-virtuoso virtual scrolling"
```

---

## Task 4: Integration Verification

- [ ] **Step 1: Start dev servers**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm dev`
Expected: Both server (port 4400) and web (port 5173) start without errors.

- [ ] **Step 2: Verify layout fixes**

Open `http://localhost:5173` in browser:

1. The left sidebar should be fixed (not scroll with the page)
2. The chat header should be fixed at the top of the chat area
3. The message input should be fixed at the bottom
4. Only the message list area should scroll
5. The "加载更多" button should appear at the top of the message list when scrolling up

- [ ] **Step 3: Verify virtual scrolling**

1. Send enough messages to fill the screen (20+ messages)
2. Scroll up through messages — only visible messages should be rendered (check with browser DevTools Elements panel)
3. Send a new message while scrolled up — verify it auto-scrolls to bottom (followOutput="auto")
4. Switch between chats — verify messages load and display correctly

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: layout and virtual scroll integration fixes"
```
