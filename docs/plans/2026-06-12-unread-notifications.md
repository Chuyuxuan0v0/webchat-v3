# 未读消息通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unread message notifications to WebChat v3 — show per-chat unread badges on sidebar chat cards, persist across sessions, and clear when the user enters a chat.

**Architecture:** New `UserChatState` MongoDB collection stores `lastReadMessageId` per user per chat. Backend computes unread counts via COUNT queries on the Message collection. Socket.IO pushes real-time unread updates. Frontend Zustand store manages unread state and renders badges on sidebar cards.

**Tech Stack:** Mongoose 8, Socket.IO 4, Zustand 5, React 19, Tailwind CSS 4

---

## File Structure

### New Files

| File                                                      | Responsibility                                                |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/server/src/models/user-chat-state.model.ts`     | Mongoose model for UserChatState                              |
| `packages/server/src/modules/unread/unread.controller.ts` | REST handlers for GET /api/unread, POST /api/unread/mark-read |
| `packages/server/src/modules/unread/unread.routes.ts`     | Express router for unread endpoints                           |

### Modified Files

| File                                                     | Changes                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/shared/src/types/index.ts`                     | Add `IUserChatState` interface, update `SocketEvents`             |
| `packages/server/src/models/index.ts`                    | Export `UserChatState` model                                      |
| `packages/server/src/modules/chat/chat.service.ts`       | Add `getUnreadCounts`, `markAsRead`, `countUnread`                |
| `packages/server/src/socket/handlers/message.handler.ts` | Emit `unread:update` after sending message                        |
| `packages/server/src/socket/index.ts`                    | Handle `chat:markRead` event, emit `unread:counts` on connect     |
| `packages/server/src/index.ts`                           | Mount unread routes                                               |
| `packages/web/src/services/api.ts`                       | Add `unreadAPI`                                                   |
| `packages/web/src/stores/chatStore.ts`                   | Add `unreadCounts` state + actions                                |
| `packages/web/src/stores/socketStore.ts`                 | Listen for `unread:counts`, `unread:update`; emit `chat:markRead` |
| `packages/web/src/components/chat/Sidebar.tsx`           | Render unread badges on chat cards                                |
| `packages/web/src/components/chat/MessageList.tsx`       | "回到底部" floating anchor for group chats                        |
| `packages/web/src/pages/ChatPage.tsx`                    | Load unread counts on mount                                       |

---

## Task 1: Shared Types — Add IUserChatState

**Files:**

- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Add IUserChatState interface and update SocketEvents**

Open `packages/shared/src/types/index.ts` and append the new interface after the `SocketEvents` interface, then add new events to `SocketEvents`:

```typescript
// Add after the existing SocketEvents interface closing brace:
export interface UserChatState {
  _id: string;
  userId: string;
  chatId: string;
  lastReadMessageId: string;
  lastReadAt: string;
}
```

Update the `SocketEvents` interface by adding three new event types inside it (before the closing `}`):

```typescript
  // Add these inside the SocketEvents interface:
  'unread:counts': Record<string, number>;
  'unread:update': { chatId: string; count: number };
  'chat:markRead': { chatId: string; messageId: string };
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/shared build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/index.ts
git commit -m "feat(shared): add UserChatState type and unread socket events"
```

---

## Task 2: Backend Model — UserChatState

**Files:**

- Create: `packages/server/src/models/user-chat-state.model.ts`
- Modify: `packages/server/src/models/index.ts`

- [ ] **Step 1: Create the UserChatState Mongoose model**

Create `packages/server/src/models/user-chat-state.model.ts`:

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IUserChatState extends Document {
  userId: mongoose.Types.ObjectId;
  chatId: string;
  lastReadMessageId: mongoose.Types.ObjectId;
  lastReadAt: Date;
}

const userChatStateSchema = new Schema<IUserChatState>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    chatId: {
      type: String,
      required: true,
    },
    lastReadMessageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

// Compound unique index: one record per user per chat
userChatStateSchema.index({ userId: 1, chatId: 1 }, { unique: true });

// Index for querying by user
userChatStateSchema.index({ userId: 1, lastReadAt: -1 });

export const UserChatState = mongoose.model<IUserChatState>('UserChatState', userChatStateSchema);
```

- [ ] **Step 2: Export from models index**

Open `packages/server/src/models/index.ts` and add the export:

```typescript
export { User, type IUser } from './user.model';
export { Message, type IMessage } from './message.model';
export { Group, type IGroup } from './group.model';
export { UserChatState, type IUserChatState } from './user-chat-state.model';
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/server build`
Expected: Build succeeds. (TypeScript compiles without error.)

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/models/user-chat-state.model.ts packages/server/src/models/index.ts
git commit -m "feat(server): add UserChatState model"
```

---

## Task 3: Backend Service — Unread Methods

**Files:**

- Modify: `packages/server/src/modules/chat/chat.service.ts`

- [ ] **Step 1: Add unread methods to chatService**

Open `packages/server/src/modules/chat/chat.service.ts`. Add the import for `UserChatState` at the top, then add three new methods to the `chatService` object.

Updated file content:

```typescript
import { Message, IMessage, UserChatState } from '../../models';

export const chatService = {
  async saveMessage(data: {
    sender: string;
    content: string;
    type: 'text' | 'image' | 'file';
    chatType: 'group' | 'private';
    chatId: string;
    fileUrl?: string;
    fileName?: string;
  }) {
    const message = await Message.create(data);
    const populated = await message.populate('sender', 'username avatar avatarBgColor');
    return populated;
  },

  async getMessages(chatId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.find({ chatId })
        .populate('sender', 'username avatar avatarBgColor')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ chatId }),
    ]);

    return {
      messages: messages.reverse(),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  // --- Unread methods ---

  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    // Get all UserChatState records for this user
    const states = await UserChatState.find({ userId });

    const counts: Record<string, number> = {};

    // For each chat state, count unread messages
    for (const state of states) {
      const count = await Message.countDocuments({
        chatId: state.chatId,
        createdAt: { $gt: state.lastReadAt },
      });
      if (count > 0) {
        counts[state.chatId] = Math.min(count, 99);
      }
    }

    // Also check chats where user has NO state record (never read = all messages unread)
    // Find all distinct chatIds this user has sent/received messages in
    const allChatIds = await Message.distinct('chatId', {
      $or: [{ sender: userId }],
    });

    // For private chats, also include chatIds where the user is the receiver
    // We need to find all private chatIds that contain the userId
    const privateChatPattern = userId;
    const privateChats = await Message.distinct('chatId', {
      chatType: 'private',
      chatId: { $regex: privateChatPattern },
      sender: { $ne: userId },
    });

    const allRelevantChatIds = [...new Set([...allChatIds, ...privateChats])];

    for (const chatId of allRelevantChatIds) {
      if (counts[chatId] !== undefined) continue; // Already counted

      // No UserChatState record = never opened this chat = count all messages
      const count = await Message.countDocuments({ chatId });
      if (count > 0) {
        counts[chatId] = Math.min(count, 99);
      }
    }

    return counts;
  },

  async countUnread(userId: string, chatId: string): Promise<number> {
    const state = await UserChatState.findOne({ userId, chatId });

    if (!state) {
      // Never opened this chat — all messages are unread
      const count = await Message.countDocuments({ chatId });
      return Math.min(count, 99);
    }

    const count = await Message.countDocuments({
      chatId,
      createdAt: { $gt: state.lastReadAt },
    });
    return Math.min(count, 99);
  },

  async markAsRead(userId: string, chatId: string, messageId: string): Promise<void> {
    await UserChatState.findOneAndUpdate(
      { userId, chatId },
      {
        lastReadMessageId: messageId,
        lastReadAt: new Date(),
      },
      { upsert: true },
    );
  },
};
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/server build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/modules/chat/chat.service.ts
git commit -m "feat(server): add unread count and mark-as-read methods to chatService"
```

---

## Task 4: Backend REST API — Unread Endpoints

**Files:**

- Create: `packages/server/src/modules/unread/unread.controller.ts`
- Create: `packages/server/src/modules/unread/unread.routes.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Create unread controller**

Create `packages/server/src/modules/unread/unread.controller.ts`:

```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { chatService } from '../chat/chat.service';

export const unreadController = {
  async getUnreadCounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const counts = await chatService.getUnreadCounts(userId);
      res.json(counts);
    } catch (error) {
      next(error);
    }
  },

  async markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { chatId, messageId } = req.body;
      if (!chatId || !messageId) {
        res.status(400).json({ message: 'chatId and messageId are required' });
        return;
      }

      await chatService.markAsRead(userId, chatId, messageId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};
```

- [ ] **Step 2: Create unread routes**

Create `packages/server/src/modules/unread/unread.routes.ts`:

```typescript
import { Router, type IRouter } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { unreadController } from './unread.controller';

const router: IRouter = Router();

router.get('/', authMiddleware, unreadController.getUnreadCounts);
router.post('/mark-read', authMiddleware, unreadController.markAsRead);

export default router;
```

- [ ] **Step 3: Mount routes in index.ts**

Open `packages/server/src/index.ts`. Add the import after the existing route imports (line 7):

```typescript
import unreadRoutes from './modules/unread/unread.routes';
```

Add the route mount after the existing `app.use('/api/upload', uploadRoutes);` line:

```typescript
app.use('/api/unread', unreadRoutes);
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/server build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/modules/unread/ packages/server/src/index.ts
git commit -m "feat(server): add unread REST endpoints (GET /api/unread, POST /api/unread/mark-read)"
```

---

## Task 5: Backend Socket — Unread Events

**Files:**

- Modify: `packages/server/src/socket/handlers/message.handler.ts`
- Modify: `packages/server/src/socket/index.ts`

- [ ] **Step 1: Emit unread:update after message is sent**

Open `packages/server/src/socket/handlers/message.handler.ts`. Add the import for `chatService` is already there. Add the unread update logic after the message routing.

Updated file content:

```typescript
import { Server, Socket } from 'socket.io';
import { chatService } from '../../modules/chat/chat.service';

export const messageHandler = (io: Server, socket: Socket) => {
  socket.on('message:send', async (data) => {
    try {
      const userId = (socket as any).userId;

      const message = await chatService.saveMessage({
        sender: userId,
        content: data.content,
        type: data.type || 'text',
        chatType: data.chatType,
        chatId: data.chatId,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
      });

      if (data.chatType === 'group') {
        io.emit('message:receive', message);

        // Notify all OTHER users in the group about unread count
        for (const [, s] of io.sockets.sockets) {
          const socketUserId = (s as any).userId;
          if (socketUserId && socketUserId !== userId) {
            const count = await chatService.countUnread(socketUserId, data.chatId);
            s.emit('unread:update', { chatId: data.chatId, count });
          }
        }
      } else {
        socket.emit('message:receive', message);

        const otherUserId = data.chatId.split('_').find((id: string) => id !== userId);
        const receiverSocket = Array.from(io.sockets.sockets.values()).find(
          (s) => (s as any).userId === otherUserId,
        );

        if (receiverSocket) {
          receiverSocket.emit('message:receive', message);

          // Send unread count to the receiver
          const count = await chatService.countUnread(otherUserId, data.chatId);
          receiverSocket.emit('unread:update', { chatId: data.chatId, count });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
};
```

- [ ] **Step 2: Handle chat:markRead and emit unread:counts on connect**

Open `packages/server/src/socket/index.ts`. Add the import for `chatService` and add two new handlers inside `io.on('connection')`.

Add import at the top:

```typescript
import { chatService } from '../modules/chat/chat.service';
```

Inside the `io.on('connection', (socket) => { ... })` block, after the `presenceHandler(io, socket);` line, add:

```typescript
// Send all unread counts to the newly connected user
const userId = (socket as any).userId;
if (userId) {
  const counts = await chatService.getUnreadCounts(userId);
  socket.emit('unread:counts', counts);
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
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/server build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/socket/handlers/message.handler.ts packages/server/src/socket/index.ts
git commit -m "feat(server): emit unread:update on message send, handle chat:markRead socket event"
```

---

## Task 6: Frontend API Client — Unread API

**Files:**

- Modify: `packages/web/src/services/api.ts`

- [ ] **Step 1: Add unreadAPI to api.ts**

Open `packages/web/src/services/api.ts`. Add the `unreadAPI` object before the `export default api;` line:

```typescript
export const unreadAPI = {
  getUnreadCounts: () => api.get('/unread'),
  markAsRead: (chatId: string, messageId: string) =>
    api.post('/unread/mark-read', { chatId, messageId }),
};
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/services/api.ts
git commit -m "feat(web): add unreadAPI client"
```

---

## Task 7: Frontend Store — Unread State in chatStore

**Files:**

- Modify: `packages/web/src/stores/chatStore.ts`

- [ ] **Step 1: Add unread state and actions to chatStore**

Open `packages/web/src/stores/chatStore.ts`. Update the `ChatState` interface and the store implementation.

Replace the entire file content:

```typescript
import { create } from 'zustand';
import { Message, User } from '@webchat/shared';
import { messageAPI, userAPI } from '../services/api';

interface ChatState {
  messages: Message[];
  onlineUsers: User[];
  activeChat: { id: string; type: 'group' | 'private'; name: string } | null;
  isLoading: boolean;
  hasMore: boolean;
  currentPage: number;
  unreadCounts: Record<string, number>;

  setActiveChat: (chat: { id: string; type: 'group' | 'private'; name: string }) => void;
  addMessage: (message: Message) => void;
  loadMessages: (chatId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  loadOnlineUsers: () => Promise<void>;
  setOnlineUsers: (users: User[]) => void;
  addOnlineUser: (user: { userId: string; username: string }) => void;
  removeOnlineUser: (userId: string) => void;
  incrementUnread: (chatId: string) => void;
  clearUnread: (chatId: string) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;
  updateUnreadCount: (chatId: string, count: number) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  onlineUsers: [],
  activeChat: null,
  isLoading: false,
  hasMore: true,
  currentPage: 1,
  unreadCounts: {},

  setActiveChat: (chat) => {
    set({ activeChat: chat, messages: [], hasMore: true, currentPage: 1 });
    get().loadMessages(chat.id);
  },

  addMessage: (message) => {
    const { activeChat } = get();
    if (activeChat && message.chatId === activeChat.id) {
      set((state) => ({ messages: [...state.messages, message] }));
    }
  },

  loadMessages: async (chatId) => {
    set({ isLoading: true });
    try {
      const { data } = await messageAPI.getMessages(chatId, 1);
      set({
        messages: data.messages,
        isLoading: false,
        currentPage: 1,
        hasMore: data.totalPages > 1,
      });
    } catch (error) {
      console.error('Failed to load messages:', error);
      set({ isLoading: false });
    }
  },

  loadMoreMessages: async () => {
    const { hasMore, isLoading, activeChat, currentPage, messages } = get();
    if (!hasMore || isLoading || !activeChat) return;

    set({ isLoading: true });
    try {
      const nextPage = currentPage + 1;
      const { data } = await messageAPI.getMessages(activeChat.id, nextPage);
      set({
        messages: [...data.messages, ...messages],
        currentPage: nextPage,
        hasMore: nextPage < data.totalPages,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load more messages:', error);
      set({ isLoading: false });
    }
  },

  loadOnlineUsers: async () => {
    try {
      const { data } = await userAPI.getOnlineUsers();
      set({ onlineUsers: data });
    } catch (error) {
      console.error('Failed to load online users:', error);
    }
  },

  setOnlineUsers: (users) => set({ onlineUsers: users }),

  addOnlineUser: (user) => {
    set((state) => {
      const exists = state.onlineUsers.some((u) => u._id === user.userId);
      if (exists) return state;
      return {
        onlineUsers: [
          ...state.onlineUsers,
          {
            _id: user.userId,
            username: user.username,
            email: '',
            avatarBgColor: '#4ECDC4',
            status: 'online' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };
    });
  },

  removeOnlineUser: (userId) => {
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u._id !== userId),
    }));
  },

  incrementUnread: (chatId) => {
    set((state) => {
      const current = state.unreadCounts[chatId] || 0;
      return {
        unreadCounts: {
          ...state.unreadCounts,
          [chatId]: Math.min(current + 1, 99),
        },
      };
    });
  },

  clearUnread: (chatId) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [chatId]: 0,
      },
    }));
  },

  setUnreadCounts: (counts) => {
    set({ unreadCounts: counts });
  },

  updateUnreadCount: (chatId, count) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [chatId]: count,
      },
    }));
  },
}));
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/stores/chatStore.ts
git commit -m "feat(web): add unreadCounts state and actions to chatStore"
```

---

## Task 8: Frontend Socket — Wire Up Unread Events

**Files:**

- Modify: `packages/web/src/stores/socketStore.ts`

- [ ] **Step 1: Listen for unread events and emit chat:markRead**

Open `packages/web/src/stores/socketStore.ts`. Replace the entire file content:

```typescript
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
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/stores/socketStore.ts
git commit -m "feat(web): wire up unread socket events and markAsRead action"
```

---

## Task 9: Frontend Sidebar — Render Unread Badges

**Files:**

- Modify: `packages/web/src/components/chat/Sidebar.tsx`

- [ ] **Step 1: Add unread badges to chat cards**

Open `packages/web/src/components/chat/Sidebar.tsx`. Replace the entire file content:

```tsx
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import Avatar from '../Avatar';

interface SidebarProps {
  onSelectChat: (chat: { id: string; type: 'group' | 'private'; name: string }) => void;
  activeChatId?: string;
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const display = count > 99 ? '99+' : String(count);
  return (
    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shrink-0">
      {display}
    </span>
  );
}

export default function Sidebar({ onSelectChat, activeChatId }: SidebarProps) {
  const { onlineUsers, unreadCounts } = useChatStore();
  const { user } = useAuthStore();

  const handlePrivateChat = (targetUser: { _id: string; username: string }) => {
    if (!user) return;
    const chatId = [user._id, targetUser._id].sort().join('_');
    onSelectChat({
      id: chatId,
      type: 'private',
      name: targetUser.username,
    });
  };

  return (
    <div className="w-64 bg-surface-50/80 backdrop-blur-sm border-r border-surface-200 flex flex-col">
      <div className="p-4 border-b border-surface-200/60">
        <div className="flex items-center gap-3">
          <Avatar
            username={user?.username || ''}
            avatar={user?.avatar}
            avatarBgColor={user?.avatarBgColor}
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-surface-800 truncate text-sm">{user?.username}</p>
            <p className="text-xs text-success-500">在线</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={() => onSelectChat({ id: 'global', type: 'group', name: '聊天大厅' })}
          className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 ${
            activeChatId === 'global'
              ? 'bg-primary-50 text-primary-600 shadow-xs'
              : 'hover:bg-surface-100 text-surface-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white text-lg shadow-sm">
              #
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">聊天大厅</p>
              <p className="text-xs text-surface-500">群聊</p>
            </div>
            <UnreadBadge count={unreadCounts['global'] || 0} />
          </div>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <h3 className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider">
            在线用户 ({onlineUsers.length})
          </h3>
        </div>
        <div className="space-y-0.5 px-2">
          {onlineUsers
            .filter((u) => u._id !== user?._id)
            .map((u) => {
              const chatId = user ? [user._id, u._id].sort().join('_') : '';
              return (
                <button
                  key={u._id}
                  onClick={() => handlePrivateChat(u)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-surface-100 transition-all duration-200"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      username={u.username}
                      avatar={u.avatar}
                      avatarBgColor={u.avatarBgColor}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-700">{u.username}</p>
                      <p className="text-xs text-success-500">在线</p>
                    </div>
                    <UnreadBadge count={unreadCounts[chatId] || 0} />
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chat/Sidebar.tsx
git commit -m "feat(web): render unread badges on sidebar chat cards"
```

---

## Task 10: Frontend MessageList — "回到底部" Anchor

**Files:**

- Modify: `packages/web/src/components/chat/MessageList.tsx`

- [ ] **Step 1: Add scroll-to-bottom anchor for group chats**

Open `packages/web/src/components/chat/MessageList.tsx`. Replace the entire file content:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';

export default function MessageList() {
  const { messages, isLoading, hasMore, loadMoreMessages, activeChat } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesCount = messages.length;
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesCount]);

  // For private chats, always scroll to bottom when entering
  useEffect(() => {
    if (activeChat?.type === 'private' && messagesCount > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChat?.id]);

  // Detect if user has scrolled up (for group chat "back to bottom" button)
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollBtn(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto p-4 space-y-3"
      >
        {hasMore && messages.length > 0 && (
          <div className="flex justify-center py-2">
            <button
              onClick={loadMoreMessages}
              disabled={isLoading}
              className="text-sm text-primary-500 hover:text-primary-600 disabled:text-surface-400 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isLoading ? '加载中...' : '加载更多'}
            </button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-surface-400">
            暂无消息，发送第一条吧
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message._id} message={message} />)
        )}
        <div ref={messagesEndRef} />
      </div>

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

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chat/MessageList.tsx
git commit -m "feat(web): add scroll-to-bottom anchor for group chats, auto-scroll for private chats"
```

---

## Task 11: Frontend ChatPage — Mark as Read on Chat Switch

**Files:**

- Modify: `packages/web/src/pages/ChatPage.tsx`

- [ ] **Step 1: Emit chat:markRead when user enters a chat**

Open `packages/web/src/pages/ChatPage.tsx`. Replace the entire file content:

```tsx
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
      <Sidebar onSelectChat={setActiveChat} activeChatId={activeChat?.id} />
      <ChatWindow />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm --filter @webchat/web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/ChatPage.tsx
git commit -m "feat(web): mark chat as read when switching to a chat room"
```

---

## Task 12: End-to-End Integration Test

- [ ] **Step 1: Start the dev servers**

Run: `cd /Users/crxuan/DevelopCode/webchat-1/webchat-3 && pnpm dev`
Expected: Both server (port 4400) and web (port 5173) start without errors.

- [ ] **Step 2: Open two browser windows**

1. Window A: Login as Alice (e.g. `alice@example.com`)
2. Window B: Login as Bob (e.g. `bob@example.com`)

- [ ] **Step 3: Test unread badge appears**

1. In Window A (Alice), click on "聊天大厅" (global group chat)
2. In Window A, send a message: "Hello from Alice"
3. In Window B (Bob), verify:
   - Bob is viewing the global chat → no unread badge (message appears directly)
4. In Window A, click on Bob's name in the sidebar to start a private chat
5. In Window A, send a message: "Hi Bob"
6. In Window B, verify:
   - If Bob is NOT in the private chat → Bob's sidebar shows unread badge "1" on Alice's chat card

- [ ] **Step 4: Test unread clears on chat switch**

1. In Window B (Bob), click on Alice's chat card in the sidebar
2. Verify:
   - The unread badge disappears
   - Messages load and display correctly
   - For private chat: auto-scrolls to the latest message

- [ ] **Step 5: Test persistence across page refresh**

1. In Window A (Alice), send 5 messages to Bob while Bob is viewing the global chat
2. In Window B (Bob), verify unread badge shows "5"
3. In Window B, refresh the page (F5 / Cmd+R)
4. After page reload, verify:
   - Unread badge still shows "5" (persisted via backend)
   - Clicking into the chat clears the badge

- [ ] **Step 6: Test 99+ cap**

1. In Window A (Alice), send 100 messages to Bob while Bob is in a different chat
2. In Window B (Bob), verify the unread badge shows "99+"

- [ ] **Step 7: Test group chat scroll-to-bottom**

1. In Window A (Alice), navigate to the global chat and scroll up to load older messages
2. In Window A, send a new message
3. Verify the "↓ 回到底部" floating button appears
4. Click the button → scrolls to the latest message

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete unread notifications feature"
```
