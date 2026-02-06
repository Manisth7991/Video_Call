// Authentication Controller

const User = require('../models/User.model');
const { generateToken, setTokenCookie, clearTokenCookie } = require('../utils/token');
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Input validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email, and password',
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists',
            });
        }

        // Create new user (password hashing happens in pre-save middleware)
        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password,
        });

        // Generate JWT token
        const token = generateToken(user._id, user.name, user.email);

        // Set token in httpOnly cookie
        setTokenCookie(res, token);

        // Send response (token is in httpOnly cookie, not in body)
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Registration Error:', error);

        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err) => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', '),
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error during registration',
        });
    }
};

// Login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Input validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password',
            });
        }

        // Find user and include password for comparison
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        // Compare passwords using bcrypt
        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        // Generate JWT token
        const token = generateToken(user._id, user.name, user.email);

        // Set token in httpOnly cookie
        setTokenCookie(res, token);

        // Send response (token is in httpOnly cookie, not in body)
        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login',
        });
    }
};

// Logout
const logout = async (req, res) => {
    try {
        // Clear the JWT cookie
        clearTokenCookie(res);

        res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        console.error('Logout Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during logout',
        });
    }
};


const getMe = async (req, res) => {
    try {
        // req.user is set by auth middleware
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Generate a fresh token and refresh the cookie
        const token = generateToken(user._id, user.name, user.email);
        setTokenCookie(res, token);

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('GetMe Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};

// Check authentication status (no 401 — always returns 200)
// Used on app load to silently check if user is logged in
const checkAuth = async (req, res) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.status(200).json({ success: false, user: null });
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(200).json({ success: false, user: null });
        }

        // Refresh the cookie
        const newToken = generateToken(user._id, user.name, user.email);
        setTokenCookie(res, newToken);

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        // Token invalid/expired — not an error, just not authenticated
        res.status(200).json({ success: false, user: null });
    }
};

module.exports = {
    register,
    login,
    logout,
    getMe,
    checkAuth,
};
