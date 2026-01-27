import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { paginationValidator } from '../middleware/validators.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// Get user notifications
router.get('/', paginationValidator, validate, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { unreadOnly } = req.query;

    const where = {
        userId: req.user.id,
        ...(unreadOnly === 'true' && { isRead: false }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({
            where: { userId: req.user.id, isRead: false },
        }),
    ]);

    res.json({
        success: true,
        data: {
            notifications,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            unreadCount,
        },
    });
}));

// Mark notification as read
router.put('/:id/read', asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({
        where: { id: req.params.id },
    });

    if (!notification || notification.userId !== req.user.id) {
        return res.status(404).json({
            success: false,
            message: 'Notification not found',
        });
    }

    await prisma.notification.update({
        where: { id: req.params.id },
        data: {
            isRead: true,
            readAt: new Date(),
        },
    });

    res.json({
        success: true,
        message: 'Notification marked as read',
    });
}));

// Mark all notifications as read
router.put('/read-all', asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
        where: {
            userId: req.user.id,
            isRead: false,
        },
        data: {
            isRead: true,
            readAt: new Date(),
        },
    });

    res.json({
        success: true,
        message: 'All notifications marked as read',
    });
}));

// Delete notification
router.delete('/:id', asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({
        where: { id: req.params.id },
    });

    if (!notification || notification.userId !== req.user.id) {
        return res.status(404).json({
            success: false,
            message: 'Notification not found',
        });
    }

    await prisma.notification.delete({
        where: { id: req.params.id },
    });

    res.json({
        success: true,
        message: 'Notification deleted',
    });
}));

export default router;
