
// Call Routes
// Defines API endpoints for video call room management


const express = require('express');
const router = express.Router();
const { createRoom, joinRoom, getRoomInfo } = require('../controllers/call.controller');
const { protect } = require('../middlewares/auth.middleware');

// All call routes require authentication
router.use(protect);

// Room management routes
router.post('/create-room', createRoom);
router.post('/join-room', joinRoom);
router.get('/room/:roomId', getRoomInfo);

module.exports = router;
