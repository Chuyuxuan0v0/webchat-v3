# 布局修复 + 虚拟滚动设计

## 概述

修复 WebChat v3 的布局问题（Sidebar、ChatHeader、MessageInput 应固定，只有 MessageList 滚动），并引入 react-virtuoso 虚拟滚动优化大量消息场景的性能。

## 问题

当前布局中，Sidebar、ChatHeader、MessageInput 没有正确固定。整个页面可能滚动，而不是只有消息列表区域滚动。原因是 ChatPage 和 ChatWindow 容器缺少 `overflow-hidden` 约束。

## 方案

采用 **CSS Flexbox 修复 + react-virtuoso 虚拟滚动**。

---

## Part 1: 布局修复

修改 3 个文件的 CSS 类名：

### ChatPage.tsx

```tsx
// 当前
<div className="h-screen flex bg-surface-50">
// 改为
<div className="h-screen flex overflow-hidden bg-surface-50">
```

### Sidebar.tsx

```tsx
// 当前
<div className="w-64 bg-surface-50/80 backdrop-blur-sm border-r border-surface-200 flex flex-col">
// 改为
<div className="w-64 h-full bg-surface-50/80 backdrop-blur-sm border-r border-surface-200 flex flex-col overflow-hidden">
```

### ChatWindow.tsx

```tsx
// 当前
<div className="flex-1 flex flex-col bg-surface-50">
// 改为
<div className="flex-1 flex flex-col overflow-hidden bg-surface-50">
```

**原理**：`overflow-hidden` 在父容器上创建 BFC（块级格式化上下文），子元素的 `flex-1` 能正确计算可用空间。MessageList 成为唯一滚动区域。

---

## Part 2: 虚拟滚动

### 依赖

```bash
pnpm --filter @webchat/web add react-virtuoso
```

### MessageList.tsx 重构

用 `Virtuoso` 组件替换手动的 `overflow-y-auto` 容器：

```tsx
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

export default function MessageList() {
  const { messages, isLoading, hasMore, loadMoreMessages, activeChat } = useChatStore();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // 滚动到顶部时加载更多
  const handleTopReached = () => {
    if (hasMore && !isLoading) {
      loadMoreMessages();
    }
  };

  // 滚动状态变化时检测是否在底部
  const handleScroll = () => {
    // virtuoso 的 onScroll 不直接暴露 scrollTop
    // 通过 followOutput 和 autoScroll 行为判断
  };

  // 手动滚动到底部
  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
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
        initialTopMostItemIndex={Math.max(0, messages.length - 1)}
        followOutput="auto"
        onTopReached={handleTopReached}
        itemContent={(index, message) => (
          <div className="px-4 py-1.5">
            <MessageBubble message={message} />
          </div>
        )}
        components={{
          Header: () => (
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
            ) : null
          ),
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
```

### Virtuoso 配置要点

| 配置 | 值 | 说明 |
|------|-----|------|
| `initialTopMostItemIndex` | `messages.length - 1` | 初始显示最新消息（底部） |
| `followOutput` | `"auto"` | 新消息到达时自动滚动（如果用户已在底部） |
| `computeItemKey` | `(item) => item._id` | 用消息 ID 作为 key，避免重复渲染 |
| `onTopReached` | `loadMoreMessages` | 滚动到顶部时触发加载更多 |
| `components.Header` | "加载更多"按钮 | 显示在列表顶部 |

### 保留的功能

- ✅ "加载更多"按钮（Virtuoso Header 组件）
- ✅ "回到底部"浮动按钮（群聊模式）
- ✅ 新消息到达时自动滚动到底部（`followOutput="auto"`）
- ✅ 切换聊天时显示最新消息（`initialTopMostItemIndex`）
- ✅ 未读消息角标（Sidebar，不受影响）

---

## 需要修改的文件

1. `packages/web/src/pages/ChatPage.tsx` — 加 `overflow-hidden`
2. `packages/web/src/components/chat/Sidebar.tsx` — 加 `overflow-hidden` + `h-full`
3. `packages/web/src/components/chat/ChatWindow.tsx` — 加 `overflow-hidden`
4. `packages/web/src/components/chat/MessageList.tsx` — 用 Virtuoso 替换滚动容器
5. `packages/web/package.json` — 新增 `react-virtuoso` 依赖
