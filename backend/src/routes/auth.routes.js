
// Authentication Routes
// Defines API endpoints for user authentication


const express = require('express');
const router = express.Router();
const { register, login, logout, getMe } = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes (require authentication)
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

module.exports = router;
