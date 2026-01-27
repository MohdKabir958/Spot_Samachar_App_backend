import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, optionalAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { checkPostLimit, incrementPostCount } from '../middleware/rateLimit.middleware.js';
import { incidentValidator, paginationValidator, idValidator } from '../middleware/validators.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Get incidents feed (public)
router.get('/', optionalAuth, paginationValidator, validate, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { category, status, city, lat, lng, radius } = req.query;

    // Base where clause - only show verified incidents to public
    const where = {
        status: status || 'VERIFIED',
        ...(category && { category }),
        ...(city && { city: { contains: city } }),
    };

    // If location is provided, filter by radius (basic implementation)
    // For production, use PostGIS or similar for proper geospatial queries

    const [incidents, total] = await Promise.all([
        prisma.incident.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                publisher: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true,
                        role: true,
                        isVerified: true,
                    },
                },
                media: {
                    select: {
                        id: true,
                        type: true,
                        url: true,
                        thumbnail: true,
                    },
                    take: 3,
                },
                policeStation: {
                    select: {
                        id: true,
                        name: true,
                        address: true,
                        phone: true,
                    },
                },
                _count: {
                    select: {
                        reports: true,
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

// Get single incident
router.get('/:id', optionalAuth, idValidator, validate, asyncHandler(async (req, res) => {
    const incident = await prisma.incident.findUnique({
        where: { id: req.params.id },
        include: {
            publisher: {
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    role: true,
                    isVerified: true,
                    credibilityScore: true,
                },
            },
            media: true,
            policeStation: true,
        },
    });

    if (!incident) {
        throw new AppError('Incident not found', 404);
    }

    // Only show non-verified incidents to the publisher or admin
    if (incident.status !== 'VERIFIED') {
        if (!req.user || (req.user.id !== incident.publisherId && !['ADMIN', 'MODERATOR'].includes(req.user.role))) {
            throw new AppError('Incident not found', 404);
        }
    }

    // Increment view count
    await prisma.incident.update({
        where: { id: req.params.id },
        data: { viewCount: { increment: 1 } },
    });

    res.json({
        success: true,
        data: { incident },
    });
}));

// Create incident
router.post('/', authenticate, checkPostLimit, incidentValidator, validate, asyncHandler(async (req, res) => {
    const {
        title,
        description,
        category,
        latitude,
        longitude,
        address,
        city,
        state,
        pincode,
        incidentTime,
        mediaIds,
    } = req.body;

    // Find nearest police station
    const policeStations = await prisma.policeStation.findMany({
        where: { isActive: true },
    });

    let nearestStation = null;
    let minDistance = Infinity;

    for (const station of policeStations) {
        const distance = calculateDistance(latitude, longitude, station.latitude, station.longitude);
        if (distance < minDistance) {
            minDistance = distance;
            nearestStation = station;
        }
    }

    // Create incident
    const incident = await prisma.incident.create({
        data: {
            title,
            description,
            category,
            latitude,
            longitude,
            address,
            city,
            state,
            pincode,
            incidentTime: incidentTime ? new Date(incidentTime) : new Date(),
            publisherId: req.user.id,
            publisherBadge: req.user.role,
            policeStationId: nearestStation?.id,
            status: 'SUBMITTED',
        },
        include: {
            publisher: {
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    role: true,
                },
            },
            policeStation: true,
        },
    });

    // Link media if provided
    if (mediaIds && mediaIds.length > 0) {
        await prisma.incidentMedia.updateMany({
            where: {
                id: { in: mediaIds },
                incidentId: null,
            },
            data: { incidentId: incident.id },
        });
    }

    // Increment post count
    await incrementPostCount(req.user.id);

    res.status(201).json({
        success: true,
        message: 'Incident reported successfully. It will be visible after verification.',
        data: { incident },
    });
}));

// Update incident (only if draft or own incident)
router.put('/:id', authenticate, idValidator, validate, asyncHandler(async (req, res) => {
    const incident = await prisma.incident.findUnique({
        where: { id: req.params.id },
    });

    if (!incident) {
        throw new AppError('Incident not found', 404);
    }

    if (incident.publisherId !== req.user.id) {
        throw new AppError('You can only edit your own incidents', 403);
    }

    if (!['DRAFT', 'SUBMITTED', 'REJECTED'].includes(incident.status)) {
        throw new AppError('Cannot edit incident after verification', 400);
    }

    const { title, description, category, address } = req.body;

    const updated = await prisma.incident.update({
        where: { id: req.params.id },
        data: {
            ...(title && { title }),
            ...(description && { description }),
            ...(category && { category }),
            ...(address && { address }),
            status: 'SUBMITTED', // Re-submit for verification
        },
        include: {
            media: true,
            policeStation: true,
        },
    });

    res.json({
        success: true,
        message: 'Incident updated successfully',
        data: { incident: updated },
    });
}));

// Delete incident (only if own and not verified)
router.delete('/:id', authenticate, idValidator, validate, asyncHandler(async (req, res) => {
    const incident = await prisma.incident.findUnique({
        where: { id: req.params.id },
    });

    if (!incident) {
        throw new AppError('Incident not found', 404);
    }

    if (incident.publisherId !== req.user.id && !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
        throw new AppError('You can only delete your own incidents', 403);
    }

    if (incident.status === 'VERIFIED' && !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
        throw new AppError('Cannot delete verified incidents. Contact support if needed.', 400);
    }

    await prisma.incident.delete({
        where: { id: req.params.id },
    });

    res.json({
        success: true,
        message: 'Incident deleted successfully',
    });
}));

// Report incident
router.post('/:id/report', authenticate, idValidator, validate, asyncHandler(async (req, res) => {
    const { reason, description } = req.body;

    if (!reason) {
        throw new AppError('Report reason is required', 400);
    }

    const incident = await prisma.incident.findUnique({
        where: { id: req.params.id },
    });

    if (!incident) {
        throw new AppError('Incident not found', 404);
    }

    // Check if already reported by this user
    const existingReport = await prisma.report.findFirst({
        where: {
            incidentId: req.params.id,
            reporterId: req.user.id,
        },
    });

    if (existingReport) {
        throw new AppError('You have already reported this incident', 400);
    }

    await prisma.report.create({
        data: {
            incidentId: req.params.id,
            reporterId: req.user.id,
            reason,
            description,
        },
    });

    res.status(201).json({
        success: true,
        message: 'Incident reported successfully. Our team will review it.',
    });
}));

// Share incident (increment share count)
router.post('/:id/share', idValidator, validate, asyncHandler(async (req, res) => {
    await prisma.incident.update({
        where: { id: req.params.id },
        data: { shareCount: { increment: 1 } },
    });

    res.json({
        success: true,
        message: 'Share recorded',
    });
}));

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

export default router;
