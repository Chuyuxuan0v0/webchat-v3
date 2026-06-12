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
