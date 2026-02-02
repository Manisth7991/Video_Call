// Call Controller

const crypto = require('crypto');

// In-memory room storage (in production, use Redis or database)
const activeRooms = new Map();


// Create a new call room
// POST /api/call/create-room
// Private

const createRoom = async (req, res) => {
    try {
        // Generate unique room ID
        const roomId = crypto.randomBytes(8).toString('hex');

        // Store room with creator info
        activeRooms.set(roomId, {
            createdBy: req.user.id,
            createdAt: new Date(),
            participants: [],
        });

        res.status(201).json({
            success: true,
            message: 'Room created successfully',
            roomId,
        });
    } catch (error) {
        console.error('Create Room Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create room',
        });
    }
};


// Join an existing room
// POST /api/call/join-room
// Private

const joinRoom = async (req, res) => {
    try {
        const { roomId } = req.body;

        if (!roomId) {
            return res.status(400).json({
                success: false,
                message: 'Room ID is required',
            });
        }

        // Check if room exists
        const room = activeRooms.get(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found or has expired',
            });
        }

        // Check if room is full (max 2 participants for 1-to-1 call)
        if (room.participants.length >= 2) {
            return res.status(400).json({
                success: false,
                message: 'Room is full',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Room is available',
            roomId,
        });
    } catch (error) {
        console.error('Join Room Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to join room',
        });
    }
};


// Get room info
// GET /api/call/room/:roomId
// Private

const getRoomInfo = async (req, res) => {
    try {
        const { roomId } = req.params;

        const room = activeRooms.get(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
            });
        }

        res.status(200).json({
            success: true,
            room: {
                roomId,
                createdAt: room.createdAt,
                participantCount: room.participants.length,
            },
        });
    } catch (error) {
        console.error('Get Room Info Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get room info',
        });
    }
};

// Export activeRooms for socket.js to use
module.exports = {
    createRoom,
    joinRoom,
    getRoomInfo,
    activeRooms,
};
