import dotenv from 'dotenv';

dotenv.config();

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',

    // JWT
    jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

    // Upload
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    maxVideoSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
    maxVideoDuration: parseInt(process.env.MAX_VIDEO_DURATION || '45'), // seconds

    // Rate limiting
    citizenDailyLimit: parseInt(process.env.CITIZEN_DAILY_LIMIT || '2'),
    verifiedReporterDailyLimit: parseInt(process.env.VERIFIED_REPORTER_DAILY_LIMIT || '5'),

    // Database
    databaseUrl: process.env.DATABASE_URL,

    // Is production?
    isProduction: process.env.NODE_ENV === 'production',
};
