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

        // Generate JWT token with user info for fallback auth
        const token = generateToken(user._id, user.name, user.email);

        // Set token in httpOnly cookie
        setTokenCookie(res, token);

        // Send response (without password)
        // Include token in response body as fallback for cross-origin cookie issues
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            token, // Token for localStorage fallback
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

        // Generate JWT token with user info for fallback auth
        const token = generateToken(user._id, user.name, user.email);

        // Set token in httpOnly cookie
        setTokenCookie(res, token);

        // Send response
        // Include token in response body as fallback for cross-origin cookie issues
        res.status(200).json({
            success: true,
            message: 'Login successful',
            token, // Token for localStorage fallback
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

        // Generate a fresh token for the user
        // This ensures localStorage gets updated for cross-origin cookie fallback
        const token = generateToken(user._id, user.name, user.email);

        // Also refresh the cookie
        setTokenCookie(res, token);

        res.status(200).json({
            success: true,
            token, // Include token for localStorage fallback
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

module.exports = {
    register,
    login,
    logout,
    getMe,
};
