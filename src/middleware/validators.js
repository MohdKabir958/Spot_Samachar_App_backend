import { body, param, query } from 'express-validator';

export const registerValidator = [
    body('phone')
        .isMobilePhone('any')
        .withMessage('Valid phone number is required'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .optional()
        .isEmail()
        .withMessage('Valid email is required'),
];

export const loginValidator = [
    body('phone')
        .isMobilePhone('any')
        .withMessage('Valid phone number is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
];

export const incidentValidator = [
    body('title')
        .trim()
        .isLength({ min: 5, max: 200 })
        .withMessage('Title must be between 5 and 200 characters'),
    body('description')
        .trim()
        .isLength({ min: 10, max: 2000 })
        .withMessage('Description must be between 10 and 2000 characters'),
    body('category')
        .isIn([
            'ACCIDENT', 'CRIME', 'FIRE', 'NATURAL_DISASTER', 'PROTEST',
            'TRAFFIC', 'INFRASTRUCTURE', 'HEALTH_EMERGENCY', 'CIVIC_ISSUE', 'OTHER'
        ])
        .withMessage('Valid category is required'),
    body('latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Valid latitude is required'),
    body('longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Valid longitude is required'),
];

export const policeStationValidator = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Name must be between 2 and 200 characters'),
    body('address')
        .trim()
        .isLength({ min: 5, max: 500 })
        .withMessage('Address is required'),
    body('city')
        .trim()
        .notEmpty()
        .withMessage('City is required'),
    body('state')
        .trim()
        .notEmpty()
        .withMessage('State is required'),
    body('pincode')
        .trim()
        .isLength({ min: 6, max: 6 })
        .withMessage('Valid 6-digit pincode is required'),
    body('latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Valid latitude is required'),
    body('longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Valid longitude is required'),
];

export const paginationValidator = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50'),
];

export const idValidator = [
    param('id')
        .isUUID()
        .withMessage('Valid ID is required'),
];
