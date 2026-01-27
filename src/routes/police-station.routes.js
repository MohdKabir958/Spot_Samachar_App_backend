import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { paginationValidator } from '../middleware/validators.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Get all police stations
router.get('/', paginationValidator, validate, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { city, state, search } = req.query;

    const where = {
        isActive: true,
        ...(city && { city: { contains: city } }),
        ...(state && { state: { contains: state } }),
        ...(search && {
            OR: [
                { name: { contains: search } },
                { address: { contains: search } },
            ],
        }),
    };

    const [stations, total] = await Promise.all([
        prisma.policeStation.findMany({
            where,
            skip,
            take: limit,
            orderBy: { name: 'asc' },
        }),
        prisma.policeStation.count({ where }),
    ]);

    res.json({
        success: true,
        data: {
            policeStations: stations,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
}));

// Get nearest police stations by coordinates
router.get('/nearest', asyncHandler(async (req, res) => {
    const { lat, lng, limit: limitParam } = req.query;
    const limit = parseInt(limitParam) || 5;

    if (!lat || !lng) {
        throw new AppError('Latitude and longitude are required', 400);
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
        throw new AppError('Invalid coordinates', 400);
    }

    const stations = await prisma.policeStation.findMany({
        where: { isActive: true },
    });

    // Calculate distance and sort
    const stationsWithDistance = stations.map(station => ({
        ...station,
        distance: calculateDistance(latitude, longitude, station.latitude, station.longitude),
    }));

    stationsWithDistance.sort((a, b) => a.distance - b.distance);

    const nearest = stationsWithDistance.slice(0, limit);

    res.json({
        success: true,
        data: {
            policeStations: nearest,
            userLocation: { latitude, longitude },
        },
    });
}));

// Get single police station
router.get('/:id', asyncHandler(async (req, res) => {
    const station = await prisma.policeStation.findUnique({
        where: { id: req.params.id },
    });

    if (!station) {
        throw new AppError('Police station not found', 404);
    }

    // Get incident count for this station
    const incidentCount = await prisma.incident.count({
        where: {
            policeStationId: station.id,
            status: 'VERIFIED',
        },
    });

    res.json({
        success: true,
        data: {
            policeStation: {
                ...station,
                incidentCount,
            },
        },
    });
}));

// Helper function to calculate distance (Haversine formula)
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
