import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { paginationValidator } from '../middleware/validators.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Get user profile
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            phone: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
            isVerified: true,
            credibilityScore: true,
            bio: true,
            address: true,
            city: true,
            state: true,
            pincode: true,
            createdAt: true,
            _count: {
                select: {
                    incidents: true,
                },
            },
        },
    });

    res.json({
        success: true,
        data: { user },
    });
}));

// Update user profile
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
    const { name, email, bio, address, city, state, pincode, avatar } = req.body;

    // Check if email is already taken
    if (email) {
        const existingUser = await prisma.user.findFirst({
            where: {
                email,
                NOT: { id: req.user.id },
            },
        });

        if (existingUser) {
            throw new AppError('Email is already taken', 409);
        }
    }

    const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
            ...(name && { name }),
            ...(email && { email }),
            ...(bio !== undefined && { bio }),
            ...(address && { address }),
            ...(city && { city }),
            ...(state && { state }),
            ...(pincode && { pincode }),
            ...(avatar && { avatar }),
        },
        select: {
            id: true,
            phone: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
            isVerified: true,
            bio: true,
            address: true,
            city: true,
            state: true,
            pincode: true,
        },
    });

    res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user },
    });
}));

// Get user's incidents
router.get('/incidents', authenticate, paginationValidator, validate, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const where = {
        publisherId: req.user.id,
        ...(status && { status }),
    };

    const [incidents, total] = await Promise.all([
        prisma.incident.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                media: {
                    select: {
                        id: true,
                        type: true,
                        url: true,
                        thumbnail: true,
                    },
                },
                policeStation: {
                    select: {
                        id: true,
                        name: true,
                        address: true,
                    },
                },
            },
        }),
        prisma.incident.count({ where }),
    ]);

    res.json({
        success: true,
        data: {
            incidents,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
}));

// Get public user profile
router.get('/:id', asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            isVerified: true,
            credibilityScore: true,
            bio: true,
            city: true,
            state: true,
            createdAt: true,
            _count: {
                select: {
                    incidents: {
                        where: { status: 'VERIFIED' },
                    },
                },
            },
        },
    });

    if (!user) {
        throw new AppError('User not found', 404);
    }

    res.json({
        success: true,
        data: { user },
    });
}));

// Apply for verified reporter status
router.post('/apply-verified', authenticate, asyncHandler(async (req, res) => {
    const { idProofType, idProofNumber, idProofImage } = req.body;

    if (!idProofType || !idProofNumber || !idProofImage) {
        throw new AppError('ID proof type, number, and image are required', 400);
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
    });

    if (user.role === 'VERIFIED_REPORTER') {
        throw new AppError('You are already a verified reporter', 400);
    }

    if (user.idProofType && !user.verifiedAt) {
        throw new AppError('Your verification request is already pending', 400);
    }

    await prisma.user.update({
        where: { id: req.user.id },
        data: {
            idProofType,
            idProofNumber,
            idProofImage,
        },
    });

    res.json({
        success: true,
        message: 'Verification request submitted successfully. You will be notified once reviewed.',
    });
}));

// Get notifications
router.get('/notifications/list', authenticate, paginationValidator, validate, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where: { userId: req.user.id },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.count({ where: { userId: req.user.id } }),
        prisma.notification.count({
            where: { userId: req.user.id, isRead: false },
        }),
    ]);

    res.json({
        success: true,
        data: {
            notifications,
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
}));

// Mark notification as read
router.put('/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id,
        },
    });

    if (!notification) {
        throw new AppError('Notification not found', 404);
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
router.put('/notifications/read-all', authenticate, asyncHandler(async (req, res) => {
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

export default router;
