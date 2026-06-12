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
    // Find all distinct chatIds this user has sent messages in
    const allChatIds = await Message.distinct('chatId', {
      sender: userId,
    });

    // For private chats, also include chatIds where the user is the receiver
    const privateChats = await Message.distinct('chatId', {
      chatType: 'private',
      chatId: { $regex: userId },
      sender: { $ne: userId },
    });

    const allRelevantChatIds = Array.from(new Set([...allChatIds, ...privateChats]));

    for (const chatId of allRelevantChatIds) {
      if (counts[chatId] !== undefined) continue;

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
      { upsert: true }
    );
  },
};
