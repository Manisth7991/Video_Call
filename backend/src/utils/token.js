// JWT Token Utilities
// Handles token generation and cookie management

const jwt = require('jsonwebtoken');

// Generate JWT token
// @param {string} userId - User's MongoDB ObjectId
// @param {string} userName - User's name (for fallback auth)
// @param {string} userEmail - User's email (for fallback auth)
// @returns {string} - Signed JWT token
const generateToken = (userId, userName = '', userEmail = '') => {
    return jwt.sign(
        {
            id: userId,
            name: userName,
            email: userEmail
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' } // Token expires in 7 days
    );
};

// Set JWT token in httpOnly cookie
// This is more secure than storing in localStorage/sessionStorage
// because JavaScript cannot access httpOnly cookies (prevents XSS attacks)
//
// For cross-domain (Vercel → Render), requires sameSite:'none' + secure:true
//
// @param {Object} res - Express response object
// @param {string} token - JWT token
const setTokenCookie = (res, token) => {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
        httpOnly: true,          // Prevents JavaScript access (XSS protection)
        secure: isProduction,    // HTTPS only in production; false for localhost (HTTP)
        sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-domain in production
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        path: '/',               // Cookie available across all routes
    });
};

// Clear JWT token cookie (for logout)
// Must use EXACT same settings as setTokenCookie for proper deletion
// @param {Object} res - Express response object
const clearTokenCookie = (res) => {
    const isProduction = process.env.NODE_ENV === 'production';

    res.clearCookie('token', {
        httpOnly: true,
        secure: isProduction,    // Must match setTokenCookie
        sameSite: isProduction ? 'none' : 'lax', // Must match setTokenCookie
        path: '/'
    });
};

// Verify JWT token
// @param {string} token - JWT token to verify
// @returns {Object|null} - Decoded token payload or null if invalid
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};

module.exports = {
    generateToken,
    setTokenCookie,
    clearTokenCookie,
    verifyToken,
};
