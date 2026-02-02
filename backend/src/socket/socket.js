
// Socket.IO Handler
// Manages real-time signaling for WebRTC video calls

// SIGNALING FLOW:
// 1. User A creates room and joins socket room
// 2. User B joins room via room ID
// 3. User A sends WebRTC offer to User B
// 4. User B sends WebRTC answer to User A
// 5. Both exchange ICE candidates
// 6. Peer connection established -> Video call active

// CLEANUP HANDLING:
// - User leaves room: Notify others, remove from room
// - User disconnects: Same as leave + cleanup socket state
// - Room empty: Delete room to free memory
// - Connection timeout: Handled by ping/pong mechanism


const { socketAuth } = require('../middlewares/auth.middleware');
const { activeRooms } = require('../controllers/call.controller');

// Track connected users: { odtId: { socketId, userName, roomId } }
const connectedUsers = new Map();

// Track cleanup state to prevent duplicate cleanups
const cleanupInProgress = new Set();


// Initialize Socket.IO with the HTTP server
// @param {Object} io - Socket.IO server instance

const initializeSocket = (io) => {
    // Apply authentication middleware to all socket connections
    io.use(socketAuth);

    io.on('connection', (socket) => {
        console.log(`🔌 User connected: ${socket.user.name} (${socket.id})`);

        // Store user connection info
        connectedUsers.set(socket.user.id, {
            socketId: socket.id,
            userName: socket.user.name,
            roomId: null,
            connectedAt: new Date(),
        });

        // JOIN ROOM
        // User joins a video call room
        socket.on('join-room', ({ roomId }) => {
            try {
                // Check if room exists
                const room = activeRooms.get(roomId);

                if (!room) {
                    socket.emit('error', { message: 'Room does not exist' });
                    return;
                }

                // Check room capacity (max 2 for 1-to-1 call)
                if (room.participants.length >= 2) {
                    socket.emit('error', { message: 'Room is full' });
                    return;
                }

                // Leave any previous room first (prevent duplicate connections)
                const userInfo = connectedUsers.get(socket.user.id);
                if (userInfo?.roomId && userInfo.roomId !== roomId) {
                    console.log(`🔄 User ${socket.user.name} switching from room ${userInfo.roomId} to ${roomId}`);
                    handleUserLeave(socket, userInfo.roomId, 'switching rooms');
                }

                // Check if this user is already in this room (same user, different tab)
                const alreadyInRoom = room.participants.some(p => p.odtId === socket.user.id);
                if (alreadyInRoom) {
                    console.log(`⚠️ User ${socket.user.name} is already in room ${roomId} (duplicate tab/session)`);
                    socket.emit('error', {
                        message: 'You are already in this room from another tab. Please use a different browser or incognito window to test with a second user.'
                    });
                    return;
                }

                // Join the new room
                socket.join(roomId);

                // Add user to room participants
                room.participants.push({
                    odtId: socket.user.id,
                    socketId: socket.id,
                    userName: socket.user.name,
                    joinedAt: new Date(),
                });

                // Update user's room info
                connectedUsers.set(socket.user.id, {
                    ...userInfo,
                    socketId: socket.id,
                    roomId,
                    joinedRoomAt: new Date(),
                });

                console.log(`👤 ${socket.user.name} (ID: ${socket.user.id}) joined room: ${roomId} (${room.participants.length} participants)`);

                // IDENTITY FLOW - user-joined event:
                // - This event is sent to OTHER users already in the room
                // - It contains the JOINING user's info (socket.user = the one who just joined)
                // - Recipients should set their remoteUser to this user's info
                socket.to(roomId).emit('user-joined', {
                    odtId: socket.user.id,      // ID of the user who just joined
                    userName: socket.user.name,  // Name of the user who just joined
                });
                console.log(`📢 Emitted user-joined to others in room ${roomId}: { odtId: ${socket.user.id}, userName: ${socket.user.name} }`);

                // IDENTITY FLOW - room-users event:
                // - This event is sent ONLY to the user who just joined (socket.emit)
                // - It contains a list of OTHER participants already in the room
                // - The joining user should set their remoteUser to the first participant's info
                // - We EXCLUDE the current user (socket.user.id) to avoid identity confusion
                const otherParticipants = room.participants.filter(
                    (p) => p.odtId !== socket.user.id
                );
                socket.emit('room-users', {
                    participants: otherParticipants,
                });
                console.log(`📋 Sent room-users to ${socket.user.name}:`, JSON.stringify(otherParticipants.map(p => ({ odtId: p.odtId, userName: p.userName }))));
            } catch (error) {
                console.error('Join Room Error:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        // WEBRTC SIGNALING: OFFER
        // Caller sends offer to other users in room
        // IDENTITY FLOW:
        // - socket.user = the SENDER (caller who created the offer)
        // - Recipients receive the SENDER's identity as the remote user
        socket.on('offer', ({ offer, to, roomId }) => {
            console.log(`📤 Offer from ${socket.user.name} (ID: ${socket.user.id}) in room ${roomId}`);

            // Send offer to other users in room, including sender's identity
            socket.to(roomId).emit('offer', {
                offer,
                from: socket.user.id,       // Sender's ID (the caller)
                userName: socket.user.name,  // Sender's name (the caller)
            });
        });

        // WEBRTC SIGNALING: ANSWER
        // Callee sends answer back to caller
        // IDENTITY FLOW:
        // - socket.user = the SENDER (callee who answered the call)
        // - The caller receives the SENDER's identity as the remote user
        socket.on('answer', ({ answer, to, roomId }) => {
            console.log(`📥 Answer from ${socket.user.name} (ID: ${socket.user.id}) in room ${roomId}`);

            // Send answer back to caller, including sender's identity
            socket.to(roomId).emit('answer', {
                answer,
                from: socket.user.id,       // Sender's ID (the callee)
                userName: socket.user.name,  // Sender's name (the callee)
            });
        });

        // WEBRTC SIGNALING: ICE CANDIDATE
        // Exchange ICE candidates for connection establishment
        // ICE = Interactive Connectivity Establishment
        // These help peers find the best path to connect
        socket.on('ice-candidate', ({ candidate, roomId }) => {
            // Only log occasionally to avoid spam
            // console.log(`🧊 ICE candidate from ${socket.user.name}`);

            // Broadcast ICE candidate to other users in room
            socket.to(roomId).emit('ice-candidate', {
                candidate,
                from: socket.user.id,
            });
        });

        // LEAVE ROOM
        // User explicitly leaves the video call
        // This is the clean exit path
        socket.on('leave-room', ({ roomId }) => {
            console.log(`🚪 ${socket.user.name} requesting to leave room: ${roomId}`);
            handleUserLeave(socket, roomId, 'user left');
        });

        // TOGGLE MEDIA
        // Notify others when user mutes/unmutes audio or video
        socket.on('toggle-media', ({ roomId, type, enabled }) => {
            socket.to(roomId).emit('user-toggle-media', {
                odtId: socket.user.id,
                type, // 'audio' or 'video'
                enabled,
            });
        });

        // DISCONNECT
        // Handle user disconnection (close browser, network issue, etc.)
        // This is the cleanup path for unexpected disconnections
        // DISCONNECT REASONS:
        // - 'transport close': Browser closed or network issue
        // - 'ping timeout': Connection became unresponsive  
        // - 'transport error': Network error occurred
        // - 'io server disconnect': Server initiated disconnect
        // - 'io client disconnect': Client called socket.disconnect()
        socket.on('disconnect', (reason) => {
            console.log(`🔌 User disconnected: ${socket.user.name} (reason: ${reason})`);

            const userInfo = connectedUsers.get(socket.user.id);
            if (userInfo?.roomId) {
                handleUserLeave(socket, userInfo.roomId, `disconnect: ${reason}`);
            }

            // Remove from connected users
            connectedUsers.delete(socket.user.id);

            // Log connection duration for debugging
            if (userInfo?.connectedAt) {
                const duration = Math.round((new Date() - userInfo.connectedAt) / 1000);
                console.log(`📊 ${socket.user.name} was connected for ${duration} seconds`);
            }
        });

        // ERROR HANDLER
        // Catch and log socket errors
        socket.on('error', (error) => {
            console.error(`❌ Socket error for ${socket.user.name}:`, error);
        });
    });

    // CLEANUP: Helper function to handle user leaving a room
    // Ensures proper cleanup and notification to other participants
    // @param {Object} socket - The socket instance
    // @param {string} roomId - The room ID to leave
    // @param {string} reason - Why the user is leaving (for logging)
    function handleUserLeave(socket, roomId, reason = 'unknown') {
        // Create unique key for this cleanup operation
        const cleanupKey = `${socket.user.id}-${roomId}`;

        // Prevent duplicate cleanup calls
        if (cleanupInProgress.has(cleanupKey)) {
            console.log(`⏭️ Cleanup already in progress for ${socket.user.name} in room ${roomId}`);
            return;
        }

        try {
            cleanupInProgress.add(cleanupKey);

            // Leave the socket.io room
            socket.leave(roomId);

            const room = activeRooms.get(roomId);
            if (room) {
                // Count participants before removal
                const beforeCount = room.participants.length;

                // Remove user from participants
                room.participants = room.participants.filter(
                    (p) => p.odtId !== socket.user.id
                );

                const afterCount = room.participants.length;

                // Only notify if user was actually in the room
                if (beforeCount !== afterCount) {
                    // Notify remaining participants that user left
                    socket.to(roomId).emit('user-left', {
                        odtId: socket.user.id,
                        userName: socket.user.name,
                        reason: reason,
                    });

                    console.log(`👋 ${socket.user.name} left room ${roomId} (${reason}) - ${afterCount} participants remaining`);
                }

                // CLEANUP: Delete room if empty to free server memory
                if (room.participants.length === 0) {
                    activeRooms.delete(roomId);
                    console.log(`🗑️ Room ${roomId} deleted (empty)`);
                }
            }

            // Update user info - clear room association
            const userInfo = connectedUsers.get(socket.user.id);
            if (userInfo) {
                connectedUsers.set(socket.user.id, {
                    ...userInfo,
                    roomId: null,
                    leftRoomAt: new Date(),
                });
            }
        } catch (error) {
            console.error(`❌ Leave Room Error for ${socket.user.name}:`, error);
        } finally {
            // Always remove from cleanup tracking
            cleanupInProgress.delete(cleanupKey);
        }
    }

    // CLEANUP: Periodic cleanup of stale rooms
    // Runs every 5 minutes to clean up abandoned rooms
    setInterval(() => {
        const now = new Date();
        let cleanedCount = 0;

        activeRooms.forEach((room, roomId) => {
            // Remove rooms older than 24 hours with no participants
            const roomAge = (now - room.createdAt) / (1000 * 60 * 60); // hours

            if (room.participants.length === 0 && roomAge > 24) {
                activeRooms.delete(roomId);
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            console.log(`🧹 Periodic cleanup: removed ${cleanedCount} stale rooms`);
        }
    }, 5 * 60 * 1000); // Every 5 minutes
};

module.exports = { initializeSocket, connectedUsers };
