import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase Admin SDK
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    // Production (Render): decode from base64
    const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    const json = Buffer.from(base64, 'base64').toString('utf8');
    serviceAccount = JSON.parse(json);
} else {
    // Development: read from file
    serviceAccount = JSON.parse(
        readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json', 'utf8')
    );
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const messaging = admin.messaging();

/**
 * Send push notification to specific user
 */
export async function sendNotificationToUser(userId, title, message, data = {}) {
    try {
        const payload = {
            notification: {
                title,
                body: message,
            },
            data: {
                ...data,
                userId,
            },
            topic: `user_${userId}`,
        };

        const response = await messaging.send(payload);
        console.log('Notification sent:', response);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('FCM error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send notification to police station (all officers)
 */
export async function sendNotificationToPoliceStation(stationId, title, message, data = {}) {
    try {
        const payload = {
            notification: {
                title,
                body: message,
            },
            data: {
                ...data,
                stationId,
            },
            topic: `station_${stationId}`,
        };

        const response = await messaging.send(payload);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('FCM error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send notification to all admins
 */
export async function sendNotificationToAdmins(title, message, data = {}) {
    try {
        const payload = {
            notification: {
                title,
                body: message,
            },
            data,
            topic: 'admins',
        };

        const response = await messaging.send(payload);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('FCM error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send notification to specific FCM token
 */
export async function sendNotificationToToken(fcmToken, title, message, data = {}) {
    try {
        const payload = {
            notification: {
                title,
                body: message,
            },
            data,
            token: fcmToken,
        };

        const response = await messaging.send(payload);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('FCM error:', error);
        return { success: false, error: error.message };
    }
}

export default admin;
