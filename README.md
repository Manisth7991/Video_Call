# 📹 Video Call Application

A full-stack MERN video calling application with JWT-based authentication, Socket.IO signaling, and WebRTC peer-to-peer video calls.

## 🚀 Features

- **User Authentication**
  - Email & password registration/login
  - Passwords hashed with bcrypt (12 rounds)
  - JWT stored in httpOnly cookies (XSS protection)
  - Protected routes with auth middleware

- **Video Calling**
  - One-to-one video calls
  - Create and join rooms via room IDs
  - Real-time signaling with Socket.IO
  - Peer-to-peer video with WebRTC

- **Call Controls**
  - Mute/unmute microphone
  - Enable/disable camera
  - Leave call functionality

## 📁 Project Structure

```
Root/
├── backend/
│   ├── .env                     # Environment variables
│   ├── package.json
│   └── src/
│       ├── config/
│       │   └── db.js            # MongoDB connection
│       ├── models/
│       │   └── User.model.js    # User schema with bcrypt
│       ├── controllers/
│       │   ├── auth.controller.js   # Auth logic
│       │   └── call.controller.js   # Room management
│       ├── routes/
│       │   ├── auth.routes.js   # Auth endpoints
│       │   └── call.routes.js   # Call endpoints
│       ├── middlewares/
│       │   └── auth.middleware.js   # JWT verification
│       ├── socket/
│       │   └── socket.js        # Socket.IO signaling
│       ├── utils/
│       │   └── token.js         # JWT utilities
│       ├── app.js               # Express app config
│       └── server.js            # Server entry point
│
├── frontend/
│   ├── package.json
│   └── src/
│       ├── api/
│       │   └── axios.js         # Axios with credentials
│       ├── context/
│       │   └── AuthContext.jsx  # Auth state management
│       ├── pages/
│       │   ├── Login.jsx        # Login page
│       │   ├── Register.jsx     # Registration page
│       │   ├── Dashboard.jsx    # Create/join rooms
│       │   └── CallRoom.jsx     # Video call interface
│       ├── components/
│       │   ├── VideoPlayer.jsx  # Video display
│       │   └── Controls.jsx     # Call controls
│       ├── hooks/
│       │   ├── useSocket.js     # Socket.IO hook
│       │   └── useWebRTC.js     # WebRTC hook
│       ├── App.jsx              # Routes & auth provider
│       └── main.jsx             # React entry point
│
└── README.md
```

## ⚙️ Environment Variables

### Backend (.env)
```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
PORT=5000
JWT_SECRET=your_super_secret_jwt_key_here
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### Frontend (optional .env)
```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- npm or yarn
- MongoDB Atlas account (or local MongoDB)

### Backend Setup
```bash
cd backend
npm install
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The backend runs on `http://localhost:5000` and frontend on `http://localhost:5173`.

## 🔒 Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User submits login/register form                         │
│     ↓                                                        │
│  2. Backend validates credentials                            │
│     ↓                                                        │
│  3. Password verified with bcrypt.compare()                  │
│     ↓                                                        │
│  4. JWT generated with user ID payload                       │
│     ↓                                                        │
│  5. JWT set in httpOnly cookie (not accessible by JS)        │
│     ↓                                                        │
│  6. Subsequent requests automatically include cookie         │
│     ↓                                                        │
│  7. Auth middleware verifies JWT from cookie                 │
│     ↓                                                        │
│  8. Protected routes accessible if token valid               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Features
- **httpOnly cookies**: JWT cannot be accessed by JavaScript (prevents XSS)
- **sameSite**: Prevents CSRF attacks
- **secure flag**: HTTPS only in production
- **bcrypt hashing**: 12 rounds for password security
- **Helmet**: Security headers middleware

## 📞 Video Calling - How It Works

### WebRTC Signaling Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    WEBRTC SIGNALING FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  USER A (Caller)              USER B (Callee)               │
│      │                             │                         │
│      │ 1. Create Room              │                         │
│      │────────────────────>        │                         │
│      │                             │                         │
│      │ 2. Share Room ID            │                         │
│      │ - - - - - - - - - - ->      │                         │
│      │                             │                         │
│      │        3. Join Room         │                         │
│      │<────────────────────        │                         │
│      │                             │                         │
│      │ 4. Create Offer (SDP)       │                         │
│      │────────────────────>        │                         │
│      │    via Socket.IO            │                         │
│      │                             │                         │
│      │ 5. Create Answer (SDP)      │                         │
│      │<────────────────────        │                         │
│      │    via Socket.IO            │                         │
│      │                             │                         │
│      │ 6. Exchange ICE Candidates  │                         │
│      │<─────────────────────>      │                         │
│      │    via Socket.IO            │                         │
│      │                             │                         │
│      │ 7. Peer Connection          │                         │
│      │    Established              │                         │
│      │═══════════════════════>     │                         │
│      │    Direct P2P Video         │                         │
│      │                             │                         │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Socket.IO** (Signaling Only)
   - Exchanges WebRTC offers/answers
   - Exchanges ICE candidates
   - Handles room join/leave events
   - Does NOT carry video/audio data

2. **WebRTC** (Peer-to-Peer Video)
   - `getUserMedia()`: Captures camera/microphone
   - `RTCPeerConnection`: Manages peer connection
   - STUN servers: Discover public IP addresses
   - ICE candidates: Find best connection path

3. **STUN Servers**
   - Help discover public IP for NAT traversal
   - Using Google's free STUN servers
   - For production: Consider TURN servers for firewall traversal

### Connection Sequence

```javascript
// 1. Get user media
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
});

// 2. Create peer connection with STUN servers
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

// 3. Add local tracks to connection
stream.getTracks().forEach(track => pc.addTrack(track, stream));

// 4. Create offer (caller) or answer (callee)
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

// 5. Send offer via Socket.IO
socket.emit('offer', { offer, roomId });

// 6. Receive and set remote description
await pc.setRemoteDescription(new RTCSessionDescription(answer));

// 7. Exchange ICE candidates
pc.onicecandidate = (e) => {
  if (e.candidate) {
    socket.emit('ice-candidate', { candidate: e.candidate, roomId });
  }
};

// 8. Receive remote stream
pc.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};
```

## 📡 Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join-room` | Client → Server | Join a video call room |
| `user-joined` | Server → Client | New user joined the room |
| `offer` | Client ↔ Server | WebRTC SDP offer |
| `answer` | Client ↔ Server | WebRTC SDP answer |
| `ice-candidate` | Client ↔ Server | ICE candidate for connection |
| `user-left` | Server → Client | User left the room |
| `toggle-media` | Client → Server | Audio/video toggle notification |
| `leave-room` | Client → Server | Leave the room |

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login user | No |
| POST | `/api/auth/logout` | Logout user | Yes |
| GET | `/api/auth/me` | Get current user | Yes |

### Video Calls
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/call/create-room` | Create new room | Yes |
| POST | `/api/call/join-room` | Join existing room | Yes |
| GET | `/api/call/room/:roomId` | Get room info | Yes |

## 🧪 Testing the Application

1. **Register Two Users**
   - Open two browser windows/tabs
   - Register different accounts in each

2. **Create a Room**
   - In User A's browser, click "Create New Room"
   - Copy the room ID

3. **Join the Room**
   - In User B's browser, paste the room ID
   - Click "Join Room"

4. **Video Call**
   - Both users should see each other's video
   - Test mute/unmute and video on/off controls

## 🚨 Troubleshooting

### Camera/Microphone Not Working
- Ensure browser has permission to access media devices
- Check if another application is using the camera
- Try using HTTPS (required for some browsers)

### Connection Issues
- Check if both users are on the same network or behind NAT
- STUN servers may not work for all network configurations
- Consider implementing TURN servers for better reliability

### CORS Errors
- Verify `FRONTEND_URL` in backend `.env` matches frontend URL
- Check that `credentials: true` is set in both frontend and backend

## 📝 License

MIT License

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
