import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import prisma from '../lib/prisma.js';
import fluentFfmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Configure ffmpeg path
fluentFfmpeg.setFfmpegPath(ffmpegInstaller.path);

const router = Router();

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = process.env.UPLOAD_DIR || './uploads';

        // Organize by type
        if (file.mimetype.startsWith('image/')) {
            uploadPath = path.join(uploadPath, 'images');
        } else if (file.mimetype.startsWith('video/')) {
            uploadPath = path.join(uploadPath, 'videos');
        } else if (file.fieldname === 'avatar') {
            uploadPath = path.join(uploadPath, 'avatars');
        } else {
            uploadPath = path.join(uploadPath, 'documents');
        }

        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'avatar') {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new AppError('Only images are allowed for avatars', 400), false);
        }
    } else if (file.fieldname === 'media') {
        if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
            return cb(new AppError('Only images and videos are allowed', 400), false);
        }
    }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
    }
});

// Generate thumbnail for video
const generateThumbnail = (videoPath, filename) => {
    return new Promise((resolve, reject) => {
        const thumbnailDir = path.join(process.env.UPLOAD_DIR || './uploads', 'thumbnails');
        if (!fs.existsSync(thumbnailDir)) {
            fs.mkdirSync(thumbnailDir, { recursive: true });
        }

        const thumbnailFilename = `thumb-${filename}.jpg`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

        fluentFfmpeg(videoPath)
            .screenshots({
                count: 1,
                folder: thumbnailDir,
                filename: thumbnailFilename,
                size: '320x240'
            })
            .on('end', () => {
                resolve(`/uploads/thumbnails/${thumbnailFilename}`);
            })
            .on('error', (err) => {
                console.error('Error generating thumbnail:', err);
                resolve(null); // Return null if thumbnail generation fails, don't crash
            });
    });
};

// Upload multiple files (incident media)
router.post('/media', authenticate, upload.array('media', 5), asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
        throw new AppError('No files uploaded', 400);
    }

    // Store media metadata in database (linked to user temporarily, will be linked to incident later)
    const mediaPromises = req.files.map(async (file) => {
        let type = 'IMAGE';
        let url = '';
        let thumbnail = null;
        let duration = null; // To be extracted if needed

        if (file.mimetype.startsWith('video/')) {
            type = 'VIDEO';
            url = `/uploads/videos/${file.filename}`;
            // Generate thumbnail
            thumbnail = await generateThumbnail(file.path, path.parse(file.filename).name);
        } else {
            url = `/uploads/images/${file.filename}`;
            thumbnail = url; // Use original image as thumbnail for now (could optimize later)
        }

        return prisma.incidentMedia.create({
            data: {
                type,
                url, // Path relative to server root
                thumbnail,
                size: file.size,
                mimeType: file.mimetype,
                duration: duration,
            }
        });
    });

    const mediaRecords = await Promise.all(mediaPromises);

    res.status(201).json({
        success: true,
        data: {
            media: mediaRecords.map(m => m.id), // Return IDs to be attached to incident
            urls: mediaRecords.map(m => m.url)
        }
    });
}));

// Upload single file (avatar, etc)
router.post('/single', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError('No file uploaded', 400);
    }

    let url = '';
    if (req.file.fieldname === 'avatar') {
        url = `/uploads/avatars/${req.file.filename}`;
    } else {
        url = `/uploads/documents/${req.file.filename}`;
    }

    res.status(201).json({
        success: true,
        data: {
            url,
            filename: req.file.filename
        }
    });
}));

export default router;
