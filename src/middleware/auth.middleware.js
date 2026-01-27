import { verifyToken } from '../lib/jwt.js';
import prisma from '../lib/prisma.js';

export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required',
            });
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = verifyToken(token);

            // Verify user still exists and is active
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, isActive: true, role: true },
            });

            if (!user || !user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found or inactive',
                });
            }

            req.user = {
                ...decoded,
                id: decoded.userId,
                role: user.role,
            };

            next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token',
            });
        }
    } catch (error) {
        next(error);
    }
};

export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
            });
        }

        next();
    };
};

// Optional authentication - doesn't fail if no token
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];

            try {
                const decoded = verifyToken(token);
                const user = await prisma.user.findUnique({
                    where: { id: decoded.userId },
                    select: { id: true, isActive: true, role: true },
                });

                if (user && user.isActive) {
                    req.user = {
                        ...decoded,
                        id: decoded.userId,
                        role: user.role,
                    };
                }
            } catch {
                // Ignore token errors for optional auth
            }
        }

        next();
    } catch (error) {
        next(error);
    }
};
