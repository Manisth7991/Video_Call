# Video Call Application - Challenges & Solutions

Complete technical documentation of challenges faced during development and their solutions.

---

## Challenge 1: WebRTC Connection Issues - ICE Candidate Handling

### Problem Statement
Video connections would fail intermittently, especially when testing from different networks. The peer connection would get stuck in "checking" state and never establish.

### Root Cause
ICE candidates were arriving before the remote SDP description was set, causing them to be rejected. WebRTC requires the remote description to be set before adding ICE candidates.

### Code Location
**File:** [frontend/src/hooks/useWebRTC.js](frontend/src/hooks/useWebRTC.js)

### Solution Implementation

#### Step 1: Create ICE Candidate Buffer
Added a ref to buffer candidates that arrive early.

**Code (Lines 51-52):**
```javascript
// Buffer for ICE candidates that arrive before remote description is set
const pendingIceCandidatesRef = useRef([]);
```

#### Step 2: Implement Buffering Logic
Modified the ICE candidate handler to buffer candidates when remote description isn't ready.

**Code (Lines 349-375):**
```javascript
const handleIceCandidate = useCallback(async (candidate) => {
    try {
        const pc = peerConnectionRef.current;
        if (!pc) {
            console.log('🧊 Buffering ICE candidate (no peer connection yet)');
            pendingIceCandidatesRef.current.push(candidate);
            return;
        }

        // Buffer candidate if remote description is not set yet
        if (!pc.remoteDescription) {
            console.log('🧊 Buffering ICE candidate (no remote description yet)');
            pendingIceCandidatesRef.current.push(candidate);
            return;
        }

        // Remote description is set, add candidate immediately
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('🧊 Added ICE candidate');
    } catch (error) {
        // Ignore errors for candidates that arrive after connection is established
        if (error.name !== 'InvalidStateError') {
            console.error('Error adding ICE candidate:', error);
        }
    }
}, []);
```

#### Step 3: Flush Buffered Candidates
Created a function to process all buffered candidates once remote description is set.

**Code (Lines 250-268):**
```javascript
const flushPendingIceCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || !pc.remoteDescription) return;

    const candidates = pendingIceCandidatesRef.current;
    if (candidates.length > 0) {
        console.log(`🧊 Flushing ${candidates.length} pending ICE candidates`);
        pendingIceCandidatesRef.current = [];

        for (const candidate of candidates) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('🧊 Added buffered ICE candidate');
            } catch (error) {
                if (error.name !== 'InvalidStateError') {
                    console.error('Error adding buffered ICE candidate:', error);
                }
            }
        }
    }
}, []);
```

#### Step 4: Call Flush After Setting Remote Description
Updated both offer and answer handlers to flush candidates.

**Code (Lines 306-308 in handleOffer):**
```javascript
// Set the remote description (caller's offer)
await pc.setRemoteDescription(new RTCSessionDescription(offer));

// Flush any pending ICE candidates now that remote description is set
await flushPendingIceCandidates();
```

**Code (Lines 340-343 in handleAnswer):**
```javascript
await pc.setRemoteDescription(new RTCSessionDescription(answer));
console.log('📥 Set remote description (answer)');

// Flush any pending ICE candidates now that remote description is set
await flushPendingIceCandidates();
```

#### Step 5: Add Multiple STUN Servers
Enhanced NAT traversal by adding multiple Google STUN servers.

**Code (Lines 24-32):**
```javascript
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
};
```

---

## Challenge 2: Socket.io Room Management

### Problem Statement
Managing users joining/leaving rooms was complex. Issues included:
- Users appearing twice in the same room
- Stale room data remaining after users left
- Duplicate cleanup operations causing errors
- Incorrect participant counts

### Code Location
**File:** [backend/src/socket/socket.js](backend/src/socket/socket.js)

### Solution Implementation

#### Step 1: Create User Tracking Map
Implemented a Map to track all connected users and their current state.

**Code (Lines 23-24):**
```javascript
// Track connected users: { odtId: { socketId, userName, roomId } }
const connectedUsers = new Map();
```

#### Step 2: Prevent Duplicate Room Joins
Added validation to prevent same user from joining room multiple times.

**Code (Lines 68-79 in join-room handler):**
```javascript
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
```

#### Step 3: Prevent Duplicate Cleanup Operations
Used a Set to track cleanup operations in progress.

**Code (Lines 26-27 & 253-259):**
```javascript
// Track cleanup state to prevent duplicate cleanups
const cleanupInProgress = new Set();

// In handleUserLeave function:
function handleUserLeave(socket, roomId, reason = 'unknown') {
    // Create unique key for this cleanup operation
    const cleanupKey = `${socket.user.id}-${roomId}`;

    // Prevent duplicate cleanup calls
    if (cleanupInProgress.has(cleanupKey)) {
        console.log(`⏭️ Cleanup already in progress for ${socket.user.name} in room ${roomId}`);
        return;
    }
```

#### Step 4: Proper Room Cleanup
Implemented comprehensive cleanup that removes users and deletes empty rooms.

**Code (Lines 263-290):**
```javascript
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
```

#### Step 5: Handle Disconnections
Properly cleanup when users disconnect unexpectedly.

**Code (Lines 212-228):**
```javascript
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
```

#### Step 6: Periodic Cleanup of Stale Rooms
Added interval cleanup for abandoned rooms.

**Code (Lines 305-320):**
```javascript
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
```

---

## Challenge 3: Media Stream Cleanup & Memory Leaks

### Problem Statement
After ending calls, the camera light stayed on and users couldn't start new calls. Browser console showed "setState on unmounted component" warnings. Memory profiling revealed media streams weren't being released.

### Code Location
**File:** [frontend/src/hooks/useWebRTC.js](frontend/src/hooks/useWebRTC.js)

### Solution Implementation

#### Step 1: Track Component Mount State
Prevent state updates after component unmounts.

**Code (Lines 56-62):**
```javascript
// CLEANUP: Effect to track component mount state
// This prevents "setState on unmounted component" warnings
useEffect(() => {
    isMountedRef.current = true;
    return () => {
        isMountedRef.current = false;
    };
}, []);
```

#### Step 2: Safe State Setter
Only update state if component is still mounted.

**Code (Lines 64-69):**
```javascript
// Safely update state only if component is mounted
const safeSetState = useCallback((setter, value) => {
    if (isMountedRef.current) {
        setter(value);
    }
}, []);
```

#### Step 3: Stop Media Tracks Function
Explicitly stop each track to release hardware.

**Code (Lines 71-82):**
```javascript
// CLEANUP: Stop all tracks in a media stream
// This releases the camera and microphone hardware
// @param {MediaStream} stream - The stream to stop
const stopMediaTracks = useCallback((stream) => {
    if (stream) {
        stream.getTracks().forEach((track) => {
            // Stop each track individually
            track.stop();
            console.log(`🛑 Stopped ${track.kind} track: ${track.label}`);
        });
    }
}, []);
```

#### Step 4: Close Peer Connection Properly
Remove all event listeners before closing connection.

**Code (Lines 84-105):**
```javascript
// CLEANUP: Close and cleanup peer connection
// This releases network resources and ICE candidates
const closePeerConnection = useCallback(() => {
    const pc = peerConnectionRef.current;
    if (pc) {
        // Remove all event listeners to prevent memory leaks
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onsignalingstatechange = null;
        pc.onicegatheringstatechange = null;

        // Close the connection if not already closed
        if (pc.signalingState !== 'closed') {
            pc.close();
            console.log('🔌 Peer connection closed');
        }

        peerConnectionRef.current = null;
    }
}, []);
```

#### Step 5: Comprehensive Cleanup Function
Created master cleanup that handles all resources.

**Code (Lines 416-461):**
```javascript
// CLEANUP: Comprehensive cleanup of all WebRTC resources
//
// WHY CLEANUP IS CRITICAL:
// 1. Camera/Mic: Without stopping tracks, the hardware stays active
//    (camera light stays on, mic keeps recording)
// 2. Memory: MediaStreams and RTCPeerConnection hold references
//    that prevent garbage collection
// 3. Network: Open connections consume bandwidth and can cause issues
//    with subsequent calls
// 4. State: Stale state can cause bugs when starting new calls
const cleanup = useCallback(() => {
    console.log('🧹 Starting WebRTC cleanup...');

    // STEP 1: Stop all local media tracks
    // This releases the camera and microphone hardware
    if (localStreamRef.current) {
        stopMediaTracks(localStreamRef.current);
        localStreamRef.current = null;
    }

    // STEP 2: Stop remote stream tracks (if any)
    // Remote streams should also be cleaned up
    if (remoteStreamRef.current) {
        stopMediaTracks(remoteStreamRef.current);
        remoteStreamRef.current = null;
    }

    // STEP 3: Close the peer connection
    // This terminates the WebRTC connection and releases network resources
    closePeerConnection();

    // STEP 4: Clear pending ICE candidates
    pendingIceCandidatesRef.current = [];

    // STEP 5: Reset all state to initial values
    // This ensures a clean slate for the next call
    safeSetState(setLocalStream, null);
    safeSetState(setRemoteStream, null);
    safeSetState(setIsAudioEnabled, true);
    safeSetState(setIsVideoEnabled, true);
    safeSetState(setConnectionState, 'new');

    console.log('✅ WebRTC cleanup complete - ready for new call');
}, [stopMediaTracks, closePeerConnection, safeSetState]);
```

#### Step 6: Use Refs Instead of State for WebRTC Objects
Prevent stale closures by using refs.

**Code (Lines 44-49):**
```javascript
// Refs for WebRTC objects - using refs to avoid stale closures
const peerConnectionRef = useRef(null);
const localStreamRef = useRef(null);
const remoteStreamRef = useRef(null);
// Track if component is mounted to prevent state updates after unmount
const isMountedRef = useRef(true);
```

---

## Challenge 4: CORS Issues Between Frontend & Backend

### Problem Statement
Socket.io connections were being rejected with CORS errors. During development on localhost it worked, but failed when testing with Vercel deployments. Different environments needed different origin handling.

### Code Location
**File:** [backend/src/server.js](backend/src/server.js)

### Solution Implementation

#### Step 1: Define Allowed Origins
Created array of permitted origins.

**Code (Lines 16-20):**
```javascript
// Allowed origins for Socket.IO
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
];
```

#### Step 2: Dynamic Origin Checking
Implemented function-based origin validation for Socket.io.

**Code (Lines 25-43):**
```javascript
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            // Allow requests with no origin
            if (!origin) return callback(null, true);

            // Check if origin is in allowed list
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // Allow any Vercel deployment URL for this project
            if (origin.includes('video-call') && origin.includes('vercel.app')) {
                return callback(null, true);
            }

            callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
        credentials: true, // Allow cookies
    },
```

#### Step 3: Configure Ping/Pong Timeouts
Added proper timeout configuration for connection stability.

**Code (Lines 44-45):**
```javascript
    pingTimeout: 60000, // How long to wait for pong response
    pingInterval: 25000, // How often to send ping
```

#### Step 4: Environment Variables
Used .env file for flexible origin configuration across environments.

**Usage in code:**
```javascript
process.env.FRONTEND_URL  // Points to production frontend URL
```

**Why this works:**
- Development: Explicitly allows localhost ports
- Production: Checks for environment variable
- Vercel Deployments: Pattern matching for preview deployments
- Security: Rejects unknown origins

---

## Challenge 5: State Management During Calls

### Problem Statement
Audio/video toggle states, connection states, and remote streams needed careful coordination. Using state for everything caused re-renders that disrupted peer connection event handlers. Managing transitions between different connection states was complex.

### Code Location
**File:** [frontend/src/hooks/useWebRTC.js](frontend/src/hooks/useWebRTC.js)

### Solution Implementation

#### Step 1: Separate Refs and State
Used refs for WebRTC objects, state for UI updates.

**Code (Lines 36-49):**
```javascript
// State for streams
const [localStream, setLocalStream] = useState(null);
const [remoteStream, setRemoteStream] = useState(null);
const [isAudioEnabled, setIsAudioEnabled] = useState(true);
const [isVideoEnabled, setIsVideoEnabled] = useState(true);
const [connectionState, setConnectionState] = useState('new');

// Refs for WebRTC objects - using refs to avoid stale closures
const peerConnectionRef = useRef(null);
const localStreamRef = useRef(null);
const remoteStreamRef = useRef(null);
// Track if component is mounted to prevent state updates after unmount
const isMountedRef = useRef(true);
// Callback ref for ICE candidates - will be set by CallRoom
const onIceCandidateRef = useRef(null);
```

**Why this pattern:**
- **Refs**: WebRTC objects (peer connection, streams) - don't cause re-renders
- **State**: UI values (enabled/disabled, connection status) - trigger UI updates
- **Result**: Stable peer connection, responsive UI

#### Step 2: Monitor Connection State Changes
Added listener to track peer connection state.

**Code (Lines 189-199):**
```javascript
// Monitor connection state changes
pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    console.log('📡 Connection state:', state);
    safeSetState(setConnectionState, state);

    // Handle disconnection states
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        console.log('⚠️ Connection lost or closed');
    }
};
```

#### Step 3: Toggle Audio/Video Without Recreating Stream
Directly enable/disable tracks instead of recreating stream.

**Code (Lines 377-404):**
```javascript
// Toggle audio track
// @returns {boolean} - New audio state
const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            safeSetState(setIsAudioEnabled, audioTrack.enabled);
            return audioTrack.enabled;
        }
    }
    return isAudioEnabled;
}, [isAudioEnabled, safeSetState]);

// Toggle video track
// @returns {boolean} - New video state
const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            safeSetState(setIsVideoEnabled, videoTrack.enabled);
            return videoTrack.enabled;
        }
    }
    return isVideoEnabled;
}, [isVideoEnabled, safeSetState]);
```

#### Step 4: Guard Against Missing Local Stream
Prevent operations before media is initialized.

**Code (Lines 107-114 in createPeerConnection):**
```javascript
// GUARD: Ensure local media exists before creating peer connection
// This prevents the race condition where offer is created without tracks
if (!localStreamRef.current) {
    console.error('❌ Cannot create peer connection: localStream not initialized');
    return null;
}

// Close existing connection if any
closePeerConnection();
```

**Also in createOffer (Lines 220-227):**
```javascript
// GUARD: Ensure local media exists before creating offer
if (!localStreamRef.current) {
    console.error('❌ Cannot create offer: localStream not initialized');
    return null;
}
```

#### Step 5: Handle Remote Stream Updates
Safely update remote stream when peer adds tracks.

**Code (Lines 172-177):**
```javascript
// Handle incoming remote tracks
// This fires when the remote peer adds their media tracks
pc.ontrack = (event) => {
    console.log('📥 Received remote track:', event.track.kind);
    const [stream] = event.streams;
    remoteStreamRef.current = stream;
    safeSetState(setRemoteStream, stream);
};
```

#### Step 6: Return All Necessary Functions
Exported clean API for CallRoom component.

**Code (Lines 479-490):**
```javascript
return {
    localStream,
    remoteStream,
    isAudioEnabled,
    isVideoEnabled,
    connectionState,
    peerConnection: peerConnectionRef.current,
    initializeMedia,
    createPeerConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    toggleAudio,
    toggleVideo,
    cleanup,
    handlePeerDisconnect,
    setOnIceCandidate,
};
```

---

## Key Takeaways

### What Worked Well
1. **Buffering ICE candidates** - Solved timing issues completely
2. **Using Maps/Sets** - Efficient user and cleanup tracking
3. **Refs for WebRTC objects** - Prevented stale closure bugs
4. **Explicit cleanup** - Released resources properly
5. **Dynamic CORS** - Flexible for different environments

### Common Pitfalls to Avoid
1. Adding ICE candidates before remote description
2. Not stopping media tracks on cleanup
3. Using state for WebRTC objects (causes re-renders)
4. Allowing duplicate room joins
5. Not handling disconnections properly

### Performance Improvements Made
- Prevented memory leaks with proper cleanup
- Used refs to avoid unnecessary re-renders
- Implemented efficient room tracking with Map
- Added periodic cleanup for stale data
- Removed event listeners before closing connections

---

## Testing Recommendations

1. **Different Networks**: Test peer connections across different network types (same WiFi, different WiFi, cellular)
2. **Network Interruption**: Simulate network loss during calls
3. **Multiple Tabs**: Verify duplicate session handling
4. **Long Duration Calls**: Check for memory leaks in extended calls
5. **Rapid Join/Leave**: Stress test room management

---

## Future Improvements

1. **TURN Server**: Add for better NAT traversal in restrictive networks
2. **Reconnection Logic**: Auto-reconnect when connection drops
3. **Connection Quality**: Show network stats to users
4. **Error Boundaries**: Better React error handling
5. **Screen Sharing**: Add screen share capability
6. **Recording**: Implement call recording feature
