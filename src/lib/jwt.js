import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export const generateToken = (payload) => {
    return jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn,
    });
};

export const generateRefreshToken = (userId) => {
    return jwt.sign({ userId, type: 'refresh' }, config.jwtSecret, {
        expiresIn: '30d',
    });
};

export const verifyToken = (token) => {
    return jwt.verify(token, config.jwtSecret);
};

export const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch {
        return null;
    }
};
