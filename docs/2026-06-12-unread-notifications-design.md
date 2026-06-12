# 未读消息通知设计

## 概述

为 WebChat v3 添加未读消息通知功能。当用户在线但未切换到某个聊天房间时，该房间的新消息会在侧边栏的聊天卡片上显示未读计数（上限 99+）。

## 需求

- 私聊和群聊都支持未读计数
- 未读数上限 99+（超过 99 显示 "99+"）
- 跨会话持久化（刷新页面/重新登录后未读计数保留）
- 群聊：进入房间自动清零 + "回到底部"浮动锚点
- 私聊：进入房间自动清零 + 自动滚动到最新消息
- 每个聊天卡片分别显示各自的未读数（无总未读角标）

## 方案选择

采用 **方案 A：UserChatState 集合 + lastReadMessageId**。

- 新建 `UserChatState` 集合，记录每个用户在每个聊天中的"最后已读消息 ID"
- 未读数 = 该 ID 之后的消息数量（通过 COUNT 查询计算）
- 利用 Message 已有的 `{chatId, createdAt}` 索引，查询高效
- 数据模型干净，与 Message 集合解耦

---

## 数据模型

### 新增：UserChatState

```typescript
// packages/shared/src/types/index.ts 新增
interface IUserChatState {
  _id: string;
  userId: string;            // ref User
  chatId: string;            // 私聊: "userId1_userId2"，群聊: "global"
  lastReadMessageId: string; // 最后已读消息的 _id
  lastReadAt: Date;          // 最后已读时间（辅助索引）
}
```

**索引**：
- 复合唯一索引：`{ userId: 1, chatId: 1 }`
- 辅助索引：`{ userId: 1, lastReadAt: -1 }`

**Mongoose 模型**：`packages/server/src/models/user-chat-state.model.ts`

---

## 后端

### 服务层（chat.service.ts 新增方法）

```typescript
// 获取用户所有聊天的未读数
async function getUnreadCounts(userId: string): Promise<Record<string, number>>
// 返回示例: { "aliceId_bobId": 3, "global": 15 }

// 标记某个聊天为已读
async function markAsRead(userId: string, chatId: string, messageId: string): Promise<void>
// upsert UserChatState: { userId, chatId, lastReadMessageId, lastReadAt }

// 计算单个聊天的未读数（内部方法）
async function countUnread(userId: string, chatId: string): Promise<number>
// 1. 查 UserChatState 获取 lastReadMessageId
// 2. 如果没有记录，查该 chatId 最早一条消息的 createdAt 作为基准
// 3. COUNT Message where chatId = X AND createdAt > lastReadAt
// 4. 返回 MIN(count, 99)
```

### REST API（新增两个端点）

| 方法 | 路由 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/unread` | 是 | 返回用户所有聊天的未读数 |
| POST | `/api/unread/mark-read` | 是 | 标记已读，body: `{ chatId, messageId }` |

**路由文件**：`packages/server/src/routes/unread.routes.ts`
**Controller**：`packages/server/src/modules/unread/unread.controller.ts`
**Service**：复用 `chat.service.ts` 中的方法

### Socket.IO 事件（新增）

| 方向 | 事件 | 负载 | 说明 |
|------|------|------|------|
| 服务端→客户端 | `unread:counts` | `Record<string, number>` | 用户上线时推送所有未读数 |
| 服务端→客户端 | `unread:update` | `{ chatId, count }` | 实时推送某个聊天的未读数变化 |
| 客户端→服务端 | `chat:markRead` | `{ chatId, messageId }` | 用户进入聊天时标记已读 |

**修改文件**：
- `packages/server/src/socket/handlers/message.handler.ts` — 发送消息后触发 unread:update
- `packages/server/src/socket/index.ts` — 注册 chat:markRead 事件

---

## 前端

### 状态管理（chatStore.ts 新增）

```typescript
// 新增状态
unreadCounts: Record<string, number>  // { chatId: count }

// 新增方法
incrementUnread(chatId: string)    // 收到非活跃聊天消息时 count+1
clearUnread(chatId: string)        // 进入聊天时清零
setUnreadCounts(counts: Record<string, number>)  // 批量设置（登录时）
```

### Socket 监听（socketStore.ts 新增）

```typescript
// 连接成功后
socket.on('unread:counts', (counts) => chatStore.setUnreadCounts(counts))

// 收到未读更新
socket.on('unread:update', ({ chatId, count }) => {
  chatStore.getState().unreadCounts[chatId] = count
})

// 收到非活跃聊天消息时
socket.on('message:receive', (message) => {
  const { activeChat } = useChatStore.getState()
  if (message.chatId !== activeChat?.id) {
    useChatStore.getState().incrementUnread(message.chatId)
  }
})
```

### UI 组件

**Sidebar.tsx**：
- 私聊卡片：用户名右侧显示未读角标（红色圆形，数字白色）
- 群聊卡片：聊天名称右侧显示未读角标
- 角标样式：`bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center`
- 数字 > 99 显示 "99+"

**MessageList.tsx**：
- 群聊模式：用户不在底部时显示"↓ 新消息"浮动按钮
- 私聊模式：进入聊天时自动滚动到最新消息

**ChatPage.tsx**：
- 登录后（socket 连接成功）请求 `GET /api/unread` 获取初始未读数

---

## 数据流

### 用户上线

```
登录 → ChatPage 挂载 → socket.connect()
  → GET /api/unread → chatStore.unreadCounts = { ... }
  → 侧边栏渲染未读角标
```

### 收到新消息（不在该聊天中）

```
socket 收到 message:receive
  → 检查 chatId !== activeChat.id
  → chatStore.incrementUnread(chatId)  // 本地 +1
  → 服务端同时发送 unread:update      // 权威确认
```

### 进入聊天

```
点击聊天卡片 → chatStore.setActiveChat()
  → 加载消息
  → 获取最新消息 ID
  → socket.emit('chat:markRead', { chatId, messageId })
  → chatStore.clearUnread(chatId)
  → 私聊：自动滚动到底部
  → 群聊：显示"回到底部"锚点
```

### 刷新页面

```
token 仍在 → 自动登录 → socket.connect()
  → GET /api/unread → 恢复未读计数
```

---

## 需要修改的文件

### 后端
1. `packages/shared/src/types/index.ts` — 新增 IUserChatState 类型
2. `packages/server/src/models/user-chat-state.model.ts` — **新建** Mongoose 模型
3. `packages/server/src/modules/chat/chat.service.ts` — 新增 3 个方法
4. `packages/server/src/modules/unread/unread.controller.ts` — **新建** REST handler
5. `packages/server/src/routes/unread.routes.ts` — **新建** 路由
6. `packages/server/src/socket/handlers/message.handler.ts` — 发送消息后推送 unread:update
7. `packages/server/src/socket/index.ts` — 注册 chat:markRead 事件

### 前端
1. `packages/web/src/stores/chatStore.ts` — 新增 unreadCounts 状态和方法
2. `packages/web/src/stores/socketStore.ts` — 监听 unread 事件
3. `packages/web/src/components/chat/Sidebar.tsx` — 渲染未读角标
4. `packages/web/src/components/chat/MessageList.tsx` — "回到底部"锚点
5. `packages/web/src/pages/ChatPage.tsx` — 登录后请求未读数
