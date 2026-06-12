# WebChat v3

实时聊天应用，pnpm monorepo 架构。

## 技术栈

- **前端**: React 19 + TypeScript + Vite 6 + Zustand 5 + Tailwind CSS 4 + Socket.IO Client
- **后端**: Express 4 + TypeScript + Socket.IO 4 + Mongoose 8 + JWT
- **数据库**: MongoDB 7 (端口 27017, 数据库名 `webchat_v3`)
- **包管理**: pnpm workspace

## 项目结构

```
packages/
  shared/   — 共享 TypeScript 类型和常量 (User, Message, Group, SocketEvents)
  server/   — Express + Socket.IO 后端 (端口 4400)
  web/      — React 前端 SPA (端口 5173)
```

## 开发命令

```bash
pnpm dev          # 同时启动 server + web
pnpm dev:server   # 仅启动后端
pnpm dev:web      # 仅启动前端
pnpm build        # 构建全部 (shared → server → web)
```

## 端口与代理

| 服务 | 端口 |
|------|------|
| Vite dev server | 5173 |
| Express + Socket.IO | 4400 |
| MongoDB | 27017 |

Vite 代理规则 (`packages/web/vite.config.ts`):
- `/api` → `http://localhost:4400`
- `/uploads` → `http://localhost:4400`
- `/socket.io` → `http://localhost:4400` (ws: true)

## API 路由

| 方法 | 路由 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 否 | 注册 (email, username, password) |
| POST | `/api/auth/login` | 否 | 登录, 返回 JWT |
| GET | `/api/users/me` | 是 | 获取当前用户 |
| PUT | `/api/users/me` | 是 | 更新用户名/头像 |
| GET | `/api/users/online` | 是 | 在线用户列表 |
| GET | `/api/messages/:chatId` | 是 | 分页获取消息 (query: page, limit) |
| POST/GET/PUT | `/api/groups/*` | 是 | 群组 CRUD |
| POST | `/api/upload` | 是 | 文件上传 (multipart, field: `file`) |

## Socket 事件

**客户端发送:**
- `message:send` — `{ chatId, content, type, chatType, fileUrl?, fileName? }`
- `typing:start` / `typing:stop` — `{ chatId }`

**服务端推送:**
- `message:receive` — 完整 Message 对象 (sender 已 populate)
- `user:online` / `user:offline` — `{ userId, username }`
- `typing:indicator` — `{ chatId, userId, username }`

## 数据库模型

**User**: username, email, password(bcrypt), avatar, avatarBgColor, status(online/offline/away)
**Message**: sender(ref User), content, type(text/image/file), fileUrl, fileName, chatType(group/private), chatId, createdAt
**Group**: name, description, owner(ref User), members([ref User])

私聊 chatId 格式: `userId1_userId2` (两个 ID 排序后拼接)

## 前端状态管理 (Zustand)

- `authStore` — 用户认证状态, token 持久化到 localStorage
- `socketStore` — Socket 连接管理, 事件监听转发到 chatStore
- `chatStore` — 消息列表, 在线用户, 当前聊天, 分页

## 认证流程

- JWT 签名: `JWT_SECRET` (env), 过期: 7 天
- HTTP: `Authorization: Bearer <token>` header
- Socket: `socket.handshake.auth.token`
- 密码: bcrypt (salt rounds 10), User model pre-save hook 自动哈希
- `toJSON` transform 自动删除 password 字段

## 文件上传

- Multer 中间件, 磁盘存储到 `UPLOAD_DIR` (默认 `./uploads`)
- 文件名: `{Date.now()}-{random}{ext}`
- 允许类型: JPEG, PNG, GIF, WebP, PDF, DOC, DOCX, TXT
- 大小限制: 10MB
- 静态文件: Express `app.use('/uploads', express.static(...))`

## 已知未完成功能

- **输入提示**: 服务端已实现 `typing:start/stop` 广播, 但前端无监听和显示
- **群组功能**: 服务端 CRUD 完整, 前端仅硬编码 "聊天大厅", 未接入用户创建的群组
- **emoji-mart**: 已安装但未使用
- **Loading 组件**: 已定义但未被引用

## 环境变量 (packages/server/.env)

```
PORT=4400
MONGODB_URI=mongodb://localhost:27017/webchat_v3
JWT_SECRET=webchat-v3-super-secret-key-change-in-production
JWT_EXPIRES_IN=7d
UPLOAD_DIR=./uploads
CORS_ORIGIN=http://localhost:5173
```

## 编码约定

- UI 文本使用中文
- 服务端模块结构: `routes.ts` → `controller.ts` → `service.ts` → `model.ts`
- 前端组件: `components/chat/` 下按功能拆分
- TypeScript strict mode, 共享类型在 `@webchat/shared`
- 样式: Tailwind CSS utility classes, 无独立 CSS 文件
