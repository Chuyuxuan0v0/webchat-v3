import { Router, type IRouter } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { unreadController } from './unread.controller';

const router: IRouter = Router();

router.get('/', authMiddleware, unreadController.getUnreadCounts);
router.post('/mark-read', authMiddleware, unreadController.markAsRead);

export default router;
