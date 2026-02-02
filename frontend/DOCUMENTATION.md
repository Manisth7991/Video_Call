# Frontend Documentation

This document explains the frontend architecture, file structure, and how each component works together to provide a video calling experience using React and WebRTC.

---

## 📁 File Structure

```
frontend/
├── .env                      # Environment variables
├── index.html                # HTML entry point
├── package.json              # Dependencies and scripts
├── vite.config.js            # Vite configuration
└── src/
    ├── main.jsx              # React entry point
    ├── App.jsx               # Main app with routing
    ├── App.css               # Global styles
    ├── index.css             # Base styles
    ├── api/
    │   └── axios.js          # Axios HTTP client configuration
    ├── context/
    │   └── AuthContext.jsx   # Authentication state management
    ├── hooks/
    │   ├── useSocket.js      # Socket.IO connection hook
    │   └── useWebRTC.js      # WebRTC peer connection hook
    ├── components/
    │   ├── VideoPlayer.jsx   # Video display component
    │   ├── VideoPlayer.css
    │   ├── Controls.jsx      # Call controls (mute, video, leave)
    │   └── Controls.css
    └── pages/
        ├── Login.jsx         # Login page
        ├── Register.jsx      # Registration page
        ├── Dashboard.jsx     # Room creation/joining page
        ├── Dashboard.css
        ├── CallRoom.jsx      # Video call page
        ├── CallRoom.css
        └── Auth.css          # Shared auth styles
```

---

## 🔄 Application Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION STARTUP                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  main.jsx                                                        │
│  - Renders App component into DOM                                │
│  - Wrapped in StrictMode                                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  App.jsx                                                         │
│  - Wraps app in AuthProvider                                     │
│  - Sets up React Router                                          │
│  - Defines protected/public routes                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
         ┌───────────────────┐   ┌───────────────────┐
         │  Public Routes    │   │  Protected Routes │
         │  - /login         │   │  - /dashboard     │
         │  - /register      │   │  - /call/:roomId  │
         └───────────────────┘   └───────────────────┘
```

---

## 📄 File-by-File Explanation

### 1. `src/main.jsx` - Entry Point

**Purpose:** Bootstraps the React application

**Flow:**
```
index.html → <div id="root"> → main.jsx → createRoot() → <App />
```

**Code:**
```jsx
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

---

### 2. `src/App.jsx` - Main Application

**Purpose:** Sets up routing and authentication context

**Components:**

1. **`ProtectedRoute`** - Guards authenticated routes
   ```
   Check loading → Check isAuthenticated → Show children OR redirect to /login
   ```

2. **`PublicRoute`** - Guards public routes
   ```
   Check loading → Check isAuthenticated → Redirect to /dashboard OR show children
   ```

**Route Structure:**
| Path | Component | Protection |
|------|-----------|------------|
| `/login` | Login | Public only |
| `/register` | Register | Public only |
| `/dashboard` | Dashboard | Protected |
| `/call/:roomId` | CallRoom | Protected |
| `/` | Redirect to /dashboard | - |

---

### 3. `src/api/axios.js` - HTTP Client

**Purpose:** Configures Axios for API requests with cookie authentication

**Configuration:**
```javascript
{
    baseURL: VITE_API_URL || 'http://localhost:5000/api',
    withCredentials: true,  // CRITICAL: Sends cookies with requests
    timeout: 10000
}
```

**Interceptors:**
- **Request:** Can modify requests before sending
- **Response:** Handles 401 (unauthorized) and 500+ errors

**Usage:**
```javascript
import api from '../api/axios';
const response = await api.post('/auth/login', credentials);
```

---

### 4. `src/context/AuthContext.jsx` - Authentication State

**Purpose:** Manages user authentication across the entire app

**State:**
| State | Type | Description |
|-------|------|-------------|
| `user` | Object | Current user info |
| `loading` | boolean | Auth check in progress |
| `error` | string | Error message |
| `isAuthenticated` | boolean | User is logged in |

**Functions:**

| Function | Purpose |
|----------|---------|
| `checkAuth()` | Verify existing session on app load |
| `register(userData)` | Create new account |
| `login(credentials)` | Authenticate user |
| `logout()` | Clear session |
| `clearError()` | Reset error state |

**Flow:**
```
App Mount → checkAuth() → GET /api/auth/me → Set user state
                       ↓
              Cookie sent automatically
                       ↓
              Backend verifies JWT → Returns user data
```

**Usage:**
```jsx
const { user, login, logout, isAuthenticated } = useAuth();
```

---

### 5. `src/hooks/useSocket.js` - Socket.IO Hook

**Purpose:** Manages real-time Socket.IO connection

**State:**
| State | Type | Description |
|-------|------|-------------|
| `isConnected` | boolean | Connection status |
| `connectionError` | string | Error message |

**Connection Configuration:**
```javascript
io(SOCKET_URL, {
    withCredentials: true,     // Send cookies for auth
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    pingTimeout: 5000
})
```

**Event Handlers:**
| Event | Action |
|-------|--------|
| `connect` | Set isConnected = true |
| `disconnect` | Set isConnected = false |
| `connect_error` | Set error message |
| `reconnect` | Clear error, set connected |
| `reconnect_failed` | Show "refresh page" message |

**Cleanup:**
```
Component unmount → Remove all listeners → Disconnect socket → Clear references
```

**Usage:**
```jsx
const { socket, isConnected, connectionError } = useSocket();
```

---

### 6. `src/hooks/useWebRTC.js` - WebRTC Hook

**Purpose:** Manages WebRTC peer connections for video calls

**This is the core of the video calling functionality!**

**State:**
| State | Type | Description |
|-------|------|-------------|
| `localStream` | MediaStream | User's camera/mic stream |
| `remoteStream` | MediaStream | Other user's stream |
| `isAudioEnabled` | boolean | Mic on/off |
| `isVideoEnabled` | boolean | Camera on/off |
| `connectionState` | string | WebRTC connection state |

**ICE Servers (STUN):**
```javascript
iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // ... more Google STUN servers
]
```

**Functions:**

| Function | Role | Purpose |
|----------|------|---------|
| `initializeMedia()` | Both | Get camera + microphone access |
| `createPeerConnection()` | Both | Set up RTCPeerConnection |
| `createOffer()` | Caller | Create SDP offer |
| `handleOffer(offer)` | Joiner | Process offer, create answer |
| `handleAnswer(answer)` | Caller | Process answer |
| `handleIceCandidate(candidate)` | Both | Add ICE candidate (with buffering) |
| `toggleAudio()` | Both | Mute/unmute microphone |
| `toggleVideo()` | Both | Enable/disable camera |
| `cleanup()` | Both | Release all resources |

**WebRTC Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│                      CALLER (User A)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. initializeMedia() → Get camera/mic                          │
│  2. createPeerConnection() → Set up RTCPeerConnection           │
│  3. Add local tracks → pc.addTrack()                            │
│  4. createOffer() → Generate SDP offer                          │
│  5. setLocalDescription(offer)                                   │
│  6. Send offer via Socket.IO ─────────────────────────────────▶ │
│  7. Receive answer ◀─────────────────────────────────────────── │
│  8. setRemoteDescription(answer)                                 │
│  9. Exchange ICE candidates ◀────────────────────────────────▶  │
│  10. Connected! Remote video appears                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      JOINER (User B)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. initializeMedia() → Get camera/mic                          │
│  2. Receive offer ◀─────────────────────────────────────────── │
│  3. createPeerConnection() → Set up RTCPeerConnection           │
│  4. Add local tracks → pc.addTrack()                            │
│  5. setRemoteDescription(offer)                                  │
│  6. createAnswer() → Generate SDP answer                        │
│  7. setLocalDescription(answer)                                  │
│  8. Send answer via Socket.IO ────────────────────────────────▶ │
│  9. Exchange ICE candidates ◀────────────────────────────────▶  │
│  10. Connected! Remote video appears                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**ICE Candidate Buffering:**
```
ICE candidate arrives → Check if remoteDescription set
                     ↓
         ┌──── Yes ────┐──── No ────┐
         ▼                          ▼
    addIceCandidate()     Buffer in pendingIceCandidatesRef
                                    │
         ┌──────────────────────────┘
         ▼
    After setRemoteDescription → flushPendingIceCandidates()
```

**Cleanup Process:**
```
cleanup() called
    │
    ├─── Stop local media tracks (releases camera/mic)
    ├─── Stop remote media tracks
    ├─── Close RTCPeerConnection
    ├─── Clear pending ICE candidates
    └─── Reset all state
```

---

### 7. `src/components/VideoPlayer.jsx` - Video Display

**Purpose:** Renders a video stream with label overlay

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `stream` | MediaStream | Video stream to display |
| `muted` | boolean | Mute audio (for local preview) |
| `label` | string | User name display |
| `isLocal` | boolean | Is this the local user's video |

**Key Features:**
- Auto-plays video when stream changes
- Shows "No video" placeholder when no stream
- Different styling for local vs remote video
- `object-fit: contain` for remote (shows full frame)
- `object-fit: cover` for local (fills container)

---

### 8. `src/components/Controls.jsx` - Call Controls

**Purpose:** Provides mute, video toggle, and leave buttons

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `isAudioEnabled` | boolean | Current mic state |
| `isVideoEnabled` | boolean | Current camera state |
| `onToggleAudio` | function | Toggle microphone |
| `onToggleVideo` | function | Toggle camera |
| `onLeaveCall` | function | Leave the call |

**Buttons:**
- 🎤 Mute / Unmute
- 📹 Stop Video / Start Video
- 📞 Leave Call (red)

---

### 9. `src/pages/Login.jsx` - Login Page

**Purpose:** User authentication form

**State:**
| State | Description |
|-------|-------------|
| `formData` | { email, password } |
| `formError` | Validation/server error |
| `isSubmitting` | Loading state |

**Flow:**
```
Form Submit → Validate inputs → login(credentials) → Navigate to /dashboard
                             ↓
                     Error → Display message
```

---

### 10. `src/pages/Register.jsx` - Registration Page

**Purpose:** New user registration form

**State:**
| State | Description |
|-------|-------------|
| `formData` | { name, email, password, confirmPassword } |
| `formError` | Validation/server error |
| `isSubmitting` | Loading state |

**Validations:**
- All fields required
- Password minimum 6 characters
- Passwords must match

---

### 11. `src/pages/Dashboard.jsx` - Room Management

**Purpose:** Create or join video call rooms

**Features:**
1. **Create Room** - Generates new room ID
2. **Join Room** - Enter existing room ID
3. **Quick Guide** - How-to instructions

**Flows:**

**Create Room:**
```
Click "Create New Room" → POST /api/call/create-room → Navigate to /call/:roomId
```

**Join Room:**
```
Enter Room ID → Click "Join Room" → POST /api/call/join-room → Navigate to /call/:roomId
```

---

### 12. `src/pages/CallRoom.jsx` - Video Call Page

**Purpose:** Main video calling interface

**This is the most complex component - orchestrates everything!**

**State:**
| State | Description |
|-------|-------------|
| `isConnecting` | Initial setup in progress |
| `error` | Error message |
| `remoteUser` | Other participant's info |
| `copied` | Room ID copied feedback |

**Refs:**
| Ref | Purpose |
|-----|---------|
| `roleRef` | 'caller' or 'joiner' |
| `remoteUserLockedRef` | Prevents identity overwrite |
| `cleanupPerformedRef` | Prevents duplicate cleanup |

**Identity Management:**
```
currentUser (from useAuth) = This client's user
remoteUser (from socket events) = Other participant

RULE: remoteUser must NEVER equal currentUser
```

**Role Assignment:**
```
User A joins room first → Waits for other user
                       ↓
User B joins room → Server sends 'user-joined' to A
                 ↓
User A receives 'user-joined' → Role = CALLER → Creates offer
User B receives 'room-users' → Role = JOINER → Waits for offer
```

**Socket Events Handled:**

| Event | Trigger | Action |
|-------|---------|--------|
| `user-joined` | Another user joins | Set role=caller, create offer |
| `room-users` | We join room | Set role=joiner, wait for offer |
| `offer` | Caller sends offer | Handle offer, send answer |
| `answer` | Joiner sends answer | Handle answer |
| `ice-candidate` | ICE candidate received | Add to connection |
| `user-left` | Other user leaves | Handle disconnect |
| `error` | Server error | Display message |

**Cleanup Scenarios:**
1. **Leave button** → performCleanup() → navigate
2. **Component unmount** → performCleanup()
3. **Page refresh/close** → beforeunload event → cleanup
4. **Tab visibility change** → Optional pause (not implemented)
5. **Network disconnect** → Socket handles reconnection
6. **Remote peer disconnect** → handlePeerDisconnect()

**Complete Signaling Flow:**
```
┌────────────────────────────────────────────────────────────────────┐
│                    CallRoom Component Flow                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Mount → useSocket() connects                                    │
│  2. useEffect → initializeMedia() → Get camera/mic                 │
│  3. socket.emit('join-room') → Join socket room                    │
│  4. Receive 'user-joined' OR 'room-users' → Set role               │
│                                                                     │
│  IF CALLER:                                                         │
│  5. createPeerConnection()                                          │
│  6. createOffer() → socket.emit('offer')                           │
│  7. Listen for 'answer' → handleAnswer()                           │
│                                                                     │
│  IF JOINER:                                                         │
│  5. Listen for 'offer'                                              │
│  6. handleOffer() → Creates answer → socket.emit('answer')         │
│                                                                     │
│  BOTH:                                                              │
│  7. Exchange 'ice-candidate' events → handleIceCandidate()         │
│  8. Connection established → Remote video appears!                  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Features

1. **httpOnly Cookies:** JWT stored in server-controlled cookie
2. **withCredentials:** All requests include cookies
3. **Protected Routes:** Redirect unauthenticated users
4. **Input Validation:** Client-side form validation
5. **Error Handling:** Graceful error display

---

## 🌐 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | https://your-backend.onrender.com/api |
| `VITE_SOCKET_URL` | Backend Socket URL | https://your-backend.onrender.com |

---

## 🎨 Component Hierarchy

```
App
├── AuthProvider (context)
│   └── BrowserRouter
│       └── Routes
│           ├── PublicRoute
│           │   ├── Login
│           │   └── Register
│           │
│           └── ProtectedRoute
│               ├── Dashboard
│               │
│               └── CallRoom
│                   ├── useSocket (hook)
│                   ├── useWebRTC (hook)
│                   ├── VideoPlayer (remote)
│                   ├── VideoPlayer (local)
│                   └── Controls
```

---

## 🔄 Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Login/Register → axios (withCredentials) → Backend → Set Cookie         │
│                                                                          │
│  App Mount → AuthContext.checkAuth() → GET /api/auth/me → User State     │
│                                                                          │
│  Protected Route → Check isAuthenticated → Allow or Redirect             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         VIDEO CALL FLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Dashboard → Create/Join Room → Navigate to CallRoom                     │
│                                                                          │
│  CallRoom Mount → useSocket connects → useWebRTC gets media              │
│                                                                          │
│  Socket 'join-room' → Server notifies others → Signaling begins          │
│                                                                          │
│  WebRTC offer/answer/ICE exchange → Peer connection established          │
│                                                                          │
│  Remote stream received → VideoPlayer displays → Call active!            │
│                                                                          │
│  Leave/Disconnect → Cleanup WebRTC + Socket → Navigate away              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```
