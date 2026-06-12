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
    <div className="w-64 h-full bg-surface-50/80 backdrop-blur-sm border-r border-surface-200 flex flex-col overflow-hidden">
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
