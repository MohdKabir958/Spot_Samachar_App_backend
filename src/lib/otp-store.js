// In-memory OTP storage with expiry
const otpStore = new Map();

// Rate limiting: track OTP send attempts per email
const rateLimitStore = new Map();

const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_HOUR = 5;

/**
 * Store OTP with expiry
 */
export function storeOTP(email, otp) {
    otpStore.set(email, {
        otp,
        attempts: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + OTP_EXPIRY,
    });
}

/**
 * Verify OTP
 */
export function verifyOTP(email, inputOTP) {
    const stored = otpStore.get(email);

    if (!stored) {
        return { success: false, message: 'OTP not found or expired' };
    }

    if (Date.now() > stored.expiresAt) {
        otpStore.delete(email);
        return { success: false, message: 'OTP expired' };
    }

    if (stored.attempts >= MAX_ATTEMPTS) {
        otpStore.delete(email);
        return { success: false, message: 'Maximum attempts exceeded' };
    }

    stored.attempts++;

    if (stored.otp !== inputOTP) {
        return { success: false, message: 'Invalid OTP' };
    }

    // OTP is valid, delete it
    otpStore.delete(email);
    return { success: true, message: 'OTP verified successfully' };
}

/**
 * Check rate limit for OTP requests
 */
export function checkRateLimit(email) {
    const now = Date.now();
    const rateData = rateLimitStore.get(email);

    if (!rateData) {
        rateLimitStore.set(email, {
            count: 1,
            resetAt: now + RATE_LIMIT_WINDOW,
        });
        return { allowed: true };
    }

    if (now > rateData.resetAt) {
        // Reset the counter
        rateLimitStore.set(email, {
            count: 1,
            resetAt: now + RATE_LIMIT_WINDOW,
        });
        return { allowed: true };
    }

    if (rateData.count >= MAX_REQUESTS_PER_HOUR) {
        return {
            allowed: false,
            message: `Too many requests. Try again after ${Math.ceil((rateData.resetAt - now) / 60000)} minutes`,
        };
    }

    rateData.count++;
    return { allowed: true };
}

/**
 * Clean up expired OTPs (run periodically)
 */
export function cleanupExpiredOTPs() {
    const now = Date.now();
    for (const [email, data] of otpStore.entries()) {
        if (now > data.expiresAt) {
            otpStore.delete(email);
        }
    }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredOTPs, 10 * 60 * 1000);
