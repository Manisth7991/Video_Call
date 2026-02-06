
// Authentication Routes
// Defines API endpoints for user authentication


const express = require('express');
const router = express.Router();
const { register, login, logout, getMe, checkAuth } = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.get('/check', checkAuth); // Silent auth check (always 200, no 401)

// Protected routes (require authentication)
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

module.exports = router;
