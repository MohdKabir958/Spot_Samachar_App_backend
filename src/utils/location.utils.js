// Helper function to calculate distance between two coordinates (Haversine formula)
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

// Find nearest police station to incident location
export async function findNearestPoliceStation(latitude, longitude, prisma) {
    const allStations = await prisma.policeStation.findMany({
        where: { isActive: true },
    });

    if (allStations.length === 0) {
        return null;
    }

    let nearestStation = allStations[0];
    let minDistance = calculateDistance(
        latitude,
        longitude,
        nearestStation.latitude,
        nearestStation.longitude
    );

    for (let i = 1; i < allStations.length; i++) {
        const station = allStations[i];
        const distance = calculateDistance(
            latitude,
            longitude,
            station.latitude,
            station.longitude
        );

        if (distance < minDistance) {
            minDistance = distance;
            nearestStation = station;
        }
    }

    return { station: nearestStation, distance: minDistance };
}

// Send notification to all officers of a police station
export async function notifyPoliceStation(policeStationId, incident, prisma) {
    // Get all police officers linked to this station
    const officers = await prisma.user.findMany({
        where: {
            policeStationId,
            role: 'POLICE',
            isActive: true,
        },
    });

    if (officers.length === 0) {
        return;
    }

    // Create notification for each officer
    const notifications = officers.map(officer => ({
        userId: officer.id,
        type: 'NEW_INCIDENT_NEARBY',
        title: `New Incident: ${incident.category}`,
        message: `A new ${incident.category.toLowerCase()} incident has been reported near your jurisdiction at ${incident.address || 'the location'}.`,
        data: JSON.stringify({
            incidentId: incident.id,
            distance: incident.distance || 0,
            urgency: incident.category === 'FIRE' || incident.category === 'ACCIDENT' ? 'HIGH' : 'MEDIUM',
        }),
    }));

    await prisma.notification.createMany({
        data: notifications,
    });
}
