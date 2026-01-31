import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { generateToken, generateRefreshToken, verifyToken } from '../lib/jwt.js';
import { registerValidator, loginValidator } from '../middleware/validators.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { generateOTP, sendOTPEmail, sendWelcomeEmail } from '../services/email.service.js';
import { storeOTP, verifyOTP, checkRateLimit } from '../lib/otp-store.js';

const router = Router();

// ============================================
// EMAIL OTP AUTHENTICATION
// ============================================

// Send OTP to email
router.post('/send-otp', asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw new AppError('Email is required', 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new AppError('Invalid email format', 400);
    }

    // Check rate limit
    const rateCheck = checkRateLimit(email);
    if (!rateCheck.allowed) {
        throw new AppError(rateCheck.message, 429);
    }

    // Generate and store OTP
    const otp = generateOTP();
    storeOTP(email, otp);

    // Send OTP email asynchronously (don't wait for it)
    // This prevents delays from email service issues
    sendOTPEmail(email, otp).catch(error => {
        console.error('Failed to send OTP email (async):', error);
    });

    // Respond immediately
    res.json({
        success: true,
        message: 'OTP sent to your email',
    });
}));

// Verify OTP and create account/login
router.post('/verify-otp', asyncHandler(async (req, res) => {
    const { email, otp, name } = req.body;

    if (!email || !otp) {
        throw new AppError('Email and OTP are required', 400);
    }

    // Verify OTP
    const verification = verifyOTP(email, otp);

    if (!verification.success) {
        throw new AppError(verification.message, 400);
    }

    // Check if user exists
    let user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            avatar: true,
        },
    });

    // If user doesn't exist, create new account
    if (!user) {
        if (!name) {
            throw new AppError('Name is required for new account', 400);
        }

        // Create password from email (user won't need it for OTP login)
        const tempPassword = await bcrypt.hash(email + Math.random(), 12);

        user = await prisma.user.create({
            data: {
                email,
                name,
                password: tempPassword,
                role: 'CITIZEN',
                isVerified: true, // Email verified via OTP
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                avatar: true,
            },
        });

        // Send welcome email asynchronously
        sendWelcomeEmail(email, name).catch(error => {
            console.error('Failed to send welcome email (async):', error);
        });
    }

    if (!user.isActive) {
        throw new AppError('Your account has been suspended', 403);
    }

    // Update last login
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const accessToken = generateToken({ userId: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id });

    res.json({
        success: true,
        message: user ? 'Login successful' : 'Account created successfully',
        data: {
            user,
            accessToken,
            refreshToken,
        },
    });
}));

// ============================================
// TRADITIONAL AUTH (Admin/Police)
// ============================================

// Register new user
router.post('/register', registerValidator, validate, asyncHandler(async (req, res) => {
    const { phone, email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { phone },
                ...(email ? [{ email }] : []),
            ],
        },
    });

    if (existingUser) {
        throw new AppError('User with this phone or email already exists', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
        data: {
            phone,
            email,
            password: hashedPassword,
            name,
            role: 'CITIZEN',
        },
        select: {
            id: true,
            phone: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
        },
    });

    // Generate tokens
    const accessToken = generateToken({
        userId: user.id,
        phone: user.phone,
        role: user.role,
    });

    const refreshToken = generateRefreshToken(user.id);

    // Save refresh token
    await prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
    });

    res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
            user,
            accessToken,
            refreshToken,
        },
    });
}));

// Login with phone (Citizens)
router.post('/login', loginValidator, validate, asyncHandler(async (req, res) => {
    const { phone, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
        where: { phone },
    });

    if (!user) {
        throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
        throw new AppError('Account is deactivated. Please contact support.', 403);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401);
    }

    // Update last login
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const accessToken = generateToken({
        userId: user.id,
        phone: user.phone,
        role: user.role,
    });

    const refreshToken = generateRefreshToken(user.id);

    // Save refresh token
    await prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    });

    res.json({
        success: true,
        message: 'Login successful',
        data: {
            user: {
                id: user.id,
                phone: user.phone,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                role: user.role,
                isVerified: user.isVerified,
                credibilityScore: user.credibilityScore,
            },
            accessToken,
            refreshToken,
        },
    });
}));

// Login with email (Admin & Police)
router.post('/login/email', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new AppError('Email and password are required', 400);
    }

    // Find user by email
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            policeStation: true, // Include police station for POLICE role
        },
    });

    if (!user) {
        throw new AppError('Invalid credentials', 401);
    }

    // Only allow ADMIN, MODERATOR, or POLICE roles
    if (!['ADMIN', 'MODERATOR', 'POLICE'].includes(user.role)) {
        throw new AppError('Email login is only for Admin and Police users', 403);
    }

    if (!user.isActive) {
        throw new AppError('Account is deactivated. Please contact admin.', 403);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401);
    }

    // Update last login
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const accessToken = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
    });

    const refreshToken = generateRefreshToken(user.id);

    // Save refresh token
    await prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    });

    res.json({
        success: true,
        message: 'Login successful',
        data: {
            user: {
                id: user.id,
                phone: user.phone,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                role: user.role,
                isVerified: user.isVerified,
                credibilityScore: user.credibilityScore,
                policeStation: user.policeStation ? {
                    id: user.policeStation.id,
                    name: user.policeStation.name,
                    stationType: user.policeStation.stationType,
                    city: user.policeStation.city,
                } : null,
            },
            accessToken,
            refreshToken,
        },
    });
}));

// Refresh token
router.post('/refresh', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        throw new AppError('Refresh token is required', 400);
    }

    // Verify refresh token
    let decoded;
    try {
        decoded = verifyToken(refreshToken);
    } catch {
        throw new AppError('Invalid refresh token', 401);
    }

    // Check if refresh token exists in database
    const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
        if (storedToken) {
            await prisma.refreshToken.delete({ where: { id: storedToken.id } });
        }
        throw new AppError('Refresh token expired', 401);
    }

    if (!storedToken.user.isActive) {
        throw new AppError('Account is deactivated', 403);
    }

    // Generate new access token
    const accessToken = generateToken({
        userId: storedToken.user.id,
        phone: storedToken.user.phone,
        role: storedToken.user.role,
    });

    res.json({
        success: true,
        data: { accessToken },
    });
}));

// Logout
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
        await prisma.refreshToken.deleteMany({
            where: {
                token: refreshToken,
                userId: req.user.id,
            },
        });
    }

    res.json({
        success: true,
        message: 'Logged out successfully',
    });
}));

// Get current user
router.get('/me', authenticate, asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            phone: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
            isVerified: true,
            credibilityScore: true,
            bio: true,
            city: true,
            state: true,
            createdAt: true,
        },
    });

    res.json({
        success: true,
        data: { user },
    });
}));

// Change password
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw new AppError('Current password and new password are required', 400);
    }

    if (newPassword.length < 6) {
        throw new AppError('New password must be at least 6 characters', 400);
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
    });

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
        throw new AppError('Current password is incorrect', 401);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
        where: { id: req.user.id },
        data: { password: hashedPassword },
    });

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({
        where: { userId: req.user.id },
    });

    res.json({
        success: true,
        message: 'Password changed successfully. Please login again.',
    });
}));

export default router;
