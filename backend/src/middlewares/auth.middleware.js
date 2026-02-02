
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');


// Middleware to protect routes
// Extracts JWT from httpOnly cookie and verifies it

const protect = async (req, res, next) => {
    try {
        // Get token from httpOnly cookie
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, no token provided',
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if user still exists
            const user = await User.findById(decoded.id);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'User no longer exists',
                });
            }

            // Attach user to request object
            req.user = {
                id: user._id,
                name: user.name,
                email: user.email,
            };

            next();
        } catch (jwtError) {
            // Token verification failed
            console.error('JWT Verification Error:', jwtError.message);
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token invalid or expired',
            });
        }
    } catch (error) {
        console.error('Auth Middleware Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error in authentication',
        });
    }
};


// Middleware to verify socket authentication
// Used for Socket.IO connections

const socketAuth = async (socket, next) => {
    try {
        // Get token from socket handshake (cookies are sent automatically)
        const token = socket.handshake.auth.token ||
            socket.handshake.headers.cookie?.split('token=')[1]?.split(';')[0];

        if (!token) {
            return next(new Error('Authentication required'));
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if user exists (with retry for transient DB issues)
        let user;
        try {
            user = await User.findById(decoded.id).maxTimeMS(5000);
        } catch (dbError) {
            console.error('Socket Auth DB Error:', dbError.message);
            // If DB is temporarily unavailable, trust the token
            socket.user = {
                id: decoded.id,
                name: decoded.name || 'User',
                email: decoded.email || '',
            };
            return next();
        }

        if (!user) {
            return next(new Error('User not found'));
        }

        // Attach user info to socket
        socket.user = {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
        };

        next();
    } catch (error) {
        console.error('Socket Auth Error:', error.message);
        next(new Error('Authentication failed'));
    }
};

module.exports = {
    protect,
    socketAuth,
};
