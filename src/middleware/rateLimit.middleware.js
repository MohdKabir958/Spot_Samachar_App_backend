import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';
import { AppError } from './error.middleware.js';

export const checkPostLimit = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get or create daily tracker
        const tracker = await prisma.dailyPostTracker.findFirst({
            where: {
                userId: req.user.id,
                date: {
                    gte: today,
                },
            },
        });

        const currentCount = tracker?.postCount || 0;
        const limit = req.user.role === 'VERIFIED_REPORTER'
            ? config.verifiedReporterDailyLimit
            : config.citizenDailyLimit;

        if (currentCount >= limit) {
            throw new AppError(
                `Daily posting limit reached. ${req.user.role === 'VERIFIED_REPORTER' ? 'Verified reporters' : 'Citizens'} can post ${limit} incidents per day.`,
                429
            );
        }

        next();
    } catch (error) {
        next(error);
    }
};

export const incrementPostCount = async (userId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyPostTracker.upsert({
        where: {
            userId_date: {
                userId,
                date: today,
            },
        },
        update: {
            postCount: {
                increment: 1,
            },
        },
        create: {
            userId,
            date: today,
            postCount: 1,
        },
    });
};
