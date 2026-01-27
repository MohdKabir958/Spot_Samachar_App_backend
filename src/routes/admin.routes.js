import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { paginationValidator, policeStationValidator, idValidator } from '../middleware/validators.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// All admin routes require authentication and admin/moderator role
router.use(authenticate);
router.use(authorize('ADMIN', 'MODERATOR'));

// ============================================
// DASHBOARD STATS
// ============================================

router.get('/stats', asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
        totalUsers,
        totalIncidents,
        pendingIncidents,
        verifiedIncidents,
        todayIncidents,
        pendingReports,
        pendingVerifications,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.incident.count(),
        prisma.incident.count({ where: { status: 'SUBMITTED' } }),
        prisma.incident.count({ where: { status: 'VERIFIED' } }),
        prisma.incident.count({ where: { createdAt: { gte: today } } }),
        prisma.report.count({ where: { status: 'PENDING' } }),
        prisma.user.count({ where: { idProofType: { not: null }, verifiedAt: null } }),
    ]);

    // Get incidents by category
    const incidentsByCategory = await prisma.incident.groupBy({
        by: ['category'],
        _count: { id: true },
    });

    // Get recent incidents
    const recentIncidents = await prisma.incident.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
            publisher: {
                select: { id: true, name: true, role: true },
            },
        },
    });

    res.json({
        success: true,
        data: {
            stats: {
                totalUsers,
                totalIncidents,
                pendingIncidents,
                verifiedIncidents,
                todayIncidents,
                pendingReports,
                pendingVerifications,
            },
            incidentsByCategory,
            recentIncidents,
        },
    });
}));

// ============================================
// INCIDENT MANAGEMENT
// ============================================

// Get all incidents (with filters)
router.get('/incidents', paginationValidator, validate, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, category, search } = req.query;

    const where = {
        ...(status && { status }),
        ...(category && { category }),
        ...(search && {
            OR: [
                { title: { contains: search } },
                { description: { contains: search } },
                { publisher: { name: { contains: search } } },
            ],
        }),
    };

    const [incidents, total] = await Promise.all([
        prisma.incident.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                publisher: {
                    select: { id: true, name: true, phone: true, role: true },
                },
                media: {
                    take: 1,
                    select: { id: true, type: true, url: true, thumbnail: true },
                },
                policeStation: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { reports: true },
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

// Get single incident for review
router.get('/incidents/:id', idValidator, validate, asyncHandler(async (req, res) => {
    const incident = await prisma.incident.findUnique({
        where: { id: req.params.id },
        include: {
            publisher: {
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    email: true,
                    role: true,
                    isVerified: true,
                    credibilityScore: true,
                },
            },
            media: true,
            policeStation: true,
            reports: {
                include: {
                    reporter: {
                        select: { id: true, name: true },
                    },
                },
            },
        },
    });

    if (!incident) {
        throw new AppError('Incident not found', 404);
    }

    res.json({
        success: true,
        data: { incident },
    });
}));

// Verify/Reject incident
router.put('/incidents/:id/status', idValidator, validate, asyncHandler(async (req, res) => {
    const { status, verificationNote } = req.body;

    if (!['VERIFIED', 'REJECTED', 'TAKEN_DOWN'].includes(status)) {
        throw new AppError('Invalid status', 400);
    }

    const incident = await prisma.incident.findUnique({
        where: { id: req.params.id },
    });

    if (!incident) {
        throw new AppError('Incident not found', 404);
    }

    // Find nearest police station if being verified and location exists
    let policeStationId = incident.policeStationId;
    if (status === 'VERIFIED' && incident.latitude && incident.longitude) {
        const { findNearestPoliceStation, notifyPoliceStation } = await import('../utils/location.utils.js');
        const result = await findNearestPoliceStation(incident.latitude, incident.longitude, prisma);

        if (result) {
            policeStationId = result.station.id;

            // Notify police station officers
            await notifyPoliceStation(policeStationId, {
                ...incident,
                distance: result.distance.toFixed(2),
            }, prisma);
        }
    }

    const updated = await prisma.incident.update({
        where: { id: req.params.id },
        data: {
            status,
            verificationNote,
            verifiedAt: new Date(),
            verifiedBy: req.user.id,
            ...(policeStationId && { policeStationId }),
        },
    });

    // Create notification for publisher
    let notificationType = 'INCIDENT_VERIFIED';
    let message = 'Your incident report has been verified and is now visible to the public.';

    if (status === 'REJECTED') {
        notificationType = 'INCIDENT_REJECTED';
        message = `Your incident report was rejected. Reason: ${verificationNote || 'Not specified'}`;
    } else if (status === 'TAKEN_DOWN') {
        notificationType = 'INCIDENT_REPORTED';
        message = `Your incident report was taken down. Reason: ${verificationNote || 'Policy violation'}`;
    }

    await prisma.notification.create({
        data: {
            userId: incident.publisherId,
            type: notificationType,
            title: status === 'VERIFIED' ? 'Incident Verified!' : 'Incident Status Update',
            message,
            data: JSON.stringify({ incidentId: incident.id }),
        },
    });

    // Update user credibility score
    if (status === 'VERIFIED') {
        await prisma.user.update({
            where: { id: incident.publisherId },
            data: { credibilityScore: { increment: 2 } },
        });
    } else if (status === 'REJECTED') {
        await prisma.user.update({
            where: { id: incident.publisherId },
            data: { credibilityScore: { decrement: 1 } },
        });
    }

    // Create audit log
    await prisma.auditLog.create({
        data: {
            adminId: req.user.id,
            action: status === 'VERIFIED' ? 'VERIFY_INCIDENT' : (status === 'REJECTED' ? 'REJECT_INCIDENT' : 'TAKEDOWN_INCIDENT'),
            targetType: 'INCIDENT',
            targetId: incident.id,
            reason: verificationNote,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        },
    });

    res.json({
        success: true,
        message: `Incident ${status.toLowerCase()} successfully`,
        data: { incident: updated },
    });
}));

// ============================================
// USER MANAGEMENT
// ============================================

// Get all users
router.get('/users', paginationValidator, validate, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { role, search, pendingVerification } = req.query;

    const where = {
        ...(role && { role }),
        ...(search && {
            OR: [
                { name: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } },
            ],
        }),
        ...(pendingVerification === 'true' && {
            idProofType: { not: null },
            verifiedAt: null,
        }),
    };

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                phone: true,
                email: true,
                name: true,
                avatar: true,
                role: true,
                isVerified: true,
                isActive: true,
                credibilityScore: true,
                idProofType: true,
                verifiedAt: true,
                createdAt: true,
                _count: {
                    select: { incidents: true },
                },
            },
        }),
        prisma.user.count({ where }),
    ]);

    res.json({
        success: true,
        data: {
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
}));

// Get single user
router.get('/users/:id', idValidator, validate, asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
            id: true,
            phone: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
            isVerified: true,
            isActive: true,
            credibilityScore: true,
            bio: true,
            address: true,
            city: true,
            state: true,
            pincode: true,
            idProofType: true,
            idProofNumber: true,
            idProofImage: true,
            verifiedAt: true,
            verifiedBy: true,
            createdAt: true,
            lastLoginAt: true,
            _count: {
                select: {
                    incidents: true,
                    reports: true,
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

// Update user role/status
router.put('/users/:id', idValidator, validate, asyncHandler(async (req, res) => {
    const { role, isActive, isVerified } = req.body;

    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
    });

    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Only admins can change roles
    if (role && req.user.role !== 'ADMIN') {
        throw new AppError('Only admins can change user roles', 403);
    }

    const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: {
            ...(role && { role }),
            ...(isActive !== undefined && { isActive }),
            ...(isVerified !== undefined && { isVerified }),
        },
        select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            isActive: true,
            isVerified: true,
        },
    });

    res.json({
        success: true,
        message: 'User updated successfully',
        data: { user: updated },
    });
}));

// Approve/Reject reporter verification
router.put('/users/:id/verify', idValidator, validate, asyncHandler(async (req, res) => {
    const { approve, note } = req.body;

    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
    });

    if (!user) {
        throw new AppError('User not found', 404);
    }

    if (!user.idProofType) {
        throw new AppError('User has not submitted verification documents', 400);
    }

    if (user.verifiedAt) {
        throw new AppError('User is already verified', 400);
    }

    if (approve) {
        await prisma.user.update({
            where: { id: req.params.id },
            data: {
                role: 'VERIFIED_REPORTER',
                isVerified: true,
                verifiedAt: new Date(),
                verifiedBy: req.user.id,
            },
        });

        await prisma.notification.create({
            data: {
                userId: user.id,
                type: 'VERIFICATION_APPROVED',
                title: 'Verification Approved!',
                message: 'Congratulations! You are now a Verified Reporter. You can post up to 5 incidents per day.',
            },
        });
    } else {
        // Clear verification data
        await prisma.user.update({
            where: { id: req.params.id },
            data: {
                idProofType: null,
                idProofNumber: null,
                idProofImage: null,
            },
        });

        await prisma.notification.create({
            data: {
                userId: user.id,
                type: 'VERIFICATION_REJECTED',
                title: 'Verification Rejected',
                message: note || 'Your verification request was rejected. Please submit valid documents.',
            },
        });
    }

    res.json({
        success: true,
        message: approve ? 'User verified as reporter' : 'Verification rejected',
    });
}));

// ============================================
// POLICE STATION MANAGEMENT
// ============================================

// Create police station
router.post('/police-stations', policeStationValidator, validate, asyncHandler(async (req, res) => {
    const { name, address, city, state, pincode, phone, email, latitude, longitude } = req.body;

    const station = await prisma.policeStation.create({
        data: {
            name,
            address,
            city,
            state,
            pincode,
            phone,
            email,
            latitude,
            longitude,
        },
    });

    res.status(201).json({
        success: true,
        message: 'Police station created successfully',
        data: { policeStation: station },
    });
}));

// Update police station
router.put('/police-stations/:id', idValidator, validate, asyncHandler(async (req, res) => {
    const { name, address, city, state, pincode, phone, email, latitude, longitude, isActive } = req.body;

    const station = await prisma.policeStation.findUnique({
        where: { id: req.params.id },
    });

    if (!station) {
        throw new AppError('Police station not found', 404);
    }

    const updated = await prisma.policeStation.update({
        where: { id: req.params.id },
        data: {
            ...(name && { name }),
            ...(address && { address }),
            ...(city && { city }),
            ...(state && { state }),
            ...(pincode && { pincode }),
            ...(phone !== undefined && { phone }),
            ...(email !== undefined && { email }),
            ...(latitude && { latitude }),
            ...(longitude && { longitude }),
            ...(isActive !== undefined && { isActive }),
        },
    });

    res.json({
        success: true,
        message: 'Police station updated successfully',
        data: { policeStation: updated },
    });
}));

// Delete police station
router.delete('/police-stations/:id', authorize('ADMIN'), idValidator, validate, asyncHandler(async (req, res) => {
    const station = await prisma.policeStation.findUnique({
        where: { id: req.params.id },
    });

    if (!station) {
        throw new AppError('Police station not found', 404);
    }

    // Check if any incidents are linked
    const incidentCount = await prisma.incident.count({
        where: { policeStationId: req.params.id },
    });

    if (incidentCount > 0) {
        // Soft delete
        await prisma.policeStation.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

        return res.json({
            success: true,
            message: 'Police station deactivated (has linked incidents)',
        });
    }

    await prisma.policeStation.delete({
        where: { id: req.params.id },
    });

    res.json({
        success: true,
        message: 'Police station deleted successfully',
    });
}));

// ============================================
// REPORT MANAGEMENT
// ============================================

// Get all reports
router.get('/reports', paginationValidator, validate, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, reason } = req.query;

    const where = {
        ...(status && { status }),
        ...(reason && { reason }),
    };

    const [reports, total] = await Promise.all([
        prisma.report.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                incident: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        media: { take: 1 },
                    },
                },
                reporter: {
                    select: { id: true, name: true },
                },
            },
        }),
        prisma.report.count({ where }),
    ]);

    res.json({
        success: true,
        data: {
            reports,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
}));

// Review report
router.put('/reports/:id', idValidator, validate, asyncHandler(async (req, res) => {
    const { status, reviewNote, takeDownIncident } = req.body;

    if (!['REVIEWED', 'ACTION_TAKEN', 'DISMISSED'].includes(status)) {
        throw new AppError('Invalid status', 400);
    }

    const report = await prisma.report.findUnique({
        where: { id: req.params.id },
        include: { incident: true },
    });

    if (!report) {
        throw new AppError('Report not found', 404);
    }

    await prisma.report.update({
        where: { id: req.params.id },
        data: {
            status,
            reviewNote,
            reviewedById: req.user.id,
            reviewedAt: new Date(),
        },
    });

    // Take down incident if required
    if (takeDownIncident && report.incident) {
        await prisma.incident.update({
            where: { id: report.incident.id },
            data: {
                status: 'TAKEN_DOWN',
                verificationNote: reviewNote || 'Taken down due to reports',
                verifiedBy: req.user.id,
                verifiedAt: new Date(),
            },
        });

        await prisma.notification.create({
            data: {
                userId: report.incident.publisherId,
                type: 'INCIDENT_REPORTED',
                title: 'Incident Taken Down',
                message: `Your incident "${report.incident.title}" was taken down due to policy violation.`,
            },
        });
    }

    res.json({
        success: true,
        message: 'Report reviewed successfully',
    });
}));

export default router;
