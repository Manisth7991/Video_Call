# Backend Documentation

This document explains the backend architecture, file structure, and how each component works together to provide authentication and real-time video calling functionality.

---

## 📁 File Structure

```
backend/
├── .env                     # Environment variables
├── package.json             # Dependencies and scripts
└── src/
    ├── server.js            # Entry point - starts server
    ├── app.js               # Express app configuration
    ├── config/
    │   └── db.js            # MongoDB connection
    ├── controllers/
    │   ├── auth.controller.js   # Authentication logic
    │   └── call.controller.js   # Room management logic
    ├── middlewares/
    │   └── auth.middleware.js   # JWT authentication middleware
    ├── models/
    │   └── User.model.js    # User database schema
    ├── routes/
    │   ├── auth.routes.js   # Auth API endpoints
    │   └── call.routes.js   # Call API endpoints
    ├── socket/
    │   └── socket.js        # Socket.IO signaling handlers
    └── utils/
        └── token.js         # JWT token utilities
```

---

## 🔄 Application Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT REQUEST                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  server.js (Entry Point)                                        │
│  - Loads environment variables                                   │
│  - Creates HTTP server                                           │
│  - Initializes Socket.IO                                         │
│  - Connects to MongoDB                                           │
│  - Starts listening on PORT                                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  app.js (Express Configuration)                                  │
│  - CORS setup (allows frontend requests)                         │
│  - Security middleware (helmet)                                  │
│  - JSON/Cookie parsing                                           │
│  - Routes mounting                                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
        ┌───────────────────┐    ┌───────────────────┐
        │  HTTP Routes      │    │  Socket.IO        │
        │  (REST API)       │    │  (Real-time)      │
        └───────────────────┘    └───────────────────┘
```

---

## 📄 File-by-File Explanation

### 1. `src/server.js` - Entry Point

**Purpose:** Starts the entire backend application

**Flow:**
1. Loads environment variables from `.env` using `dotenv`
2. Creates HTTP server from Express app
3. Initializes Socket.IO with CORS configuration
4. Connects to MongoDB database
5. Initializes socket event handlers
6. Starts listening on configured PORT (default: 5000)

**Key Features:**
- Graceful shutdown handling (SIGTERM)
- Unhandled rejection/exception catching
- Connection status logging

```
Request → server.js → HTTP Server → Express App
                    → Socket.IO → Real-time Events
```

---

### 2. `src/app.js` - Express Configuration

**Purpose:** Configures Express middleware and routes

**Middleware Stack:**
1. `helmet()` - Security headers
2. `cors()` - Cross-Origin Resource Sharing
3. `express.json()` - Parse JSON bodies
4. `cookieParser()` - Parse cookies (for JWT)

**Routes:**
- `/api/auth/*` - Authentication endpoints
- `/api/call/*` - Call/Room management endpoints
- `/health` - Server health check

**Error Handling:**
- 404 handler for unknown routes
- Global error handler for all errors

---

### 3. `src/config/db.js` - Database Connection

**Purpose:** Establishes and manages MongoDB connection

**Flow:**
```
db.js → mongoose.connect() → MongoDB Atlas
         │
         ├── On Success: Log connection host
         ├── On Error: Log tips and exit process
         └── Event Handlers: error, disconnected, reconnected
```

**Connection Options:**
- `maxPoolSize: 10` - Maintain connection pool
- `serverSelectionTimeoutMS: 10000` - 10s timeout
- `retryWrites/retryReads: true` - Automatic retry

---

### 4. `src/models/User.model.js` - User Schema

**Purpose:** Defines user data structure and methods

**Schema Fields:**
| Field | Type | Validation |
|-------|------|------------|
| name | String | Required, 2-50 chars |
| email | String | Required, unique, lowercase |
| password | String | Required, min 6 chars, hidden by default |

**Methods:**

1. **Pre-save Middleware (Password Hashing)**
   ```
   User.save() → Check if password modified → bcrypt.hash() → Store hashed password
   ```

2. **comparePassword() Instance Method**
   ```
   user.comparePassword(input) → bcrypt.compare() → true/false
   ```

---

### 5. `src/utils/token.js` - JWT Utilities

**Purpose:** Handle JWT token operations

**Functions:**

| Function | Purpose |
|----------|---------|
| `generateToken(userId, name, email)` | Creates signed JWT (expires in 7 days) |
| `setTokenCookie(res, token)` | Sets httpOnly cookie with token |
| `clearTokenCookie(res)` | Clears the token cookie (logout) |
| `verifyToken(token)` | Verifies and decodes token |

**Cookie Settings (Production):**
```javascript
{
    httpOnly: true,      // Prevents XSS attacks
    secure: true,        // HTTPS only
    sameSite: 'none',    // Cross-origin allowed
    maxAge: 7 days
}
```

---

### 6. `src/middlewares/auth.middleware.js` - Authentication

**Purpose:** Protect routes and authenticate socket connections

**Functions:**

1. **`protect` (HTTP Middleware)**
   ```
   Request → Extract token from cookies → Verify JWT → Find user → Attach to req.user → Next()
                                       ↓
                              Invalid/Missing → 401 Unauthorized
   ```

2. **`socketAuth` (Socket.IO Middleware)**
   ```
   Socket Connection → Extract token from handshake → Verify JWT → Find user → Attach to socket.user
                                                   ↓
                                           Invalid → Disconnect with error
   ```

---

### 7. `src/controllers/auth.controller.js` - Auth Logic

**Purpose:** Handle user authentication operations

**Endpoints:**

| Function | Route | Description |
|----------|-------|-------------|
| `register` | POST /api/auth/register | Create new user |
| `login` | POST /api/auth/login | Authenticate user |
| `logout` | POST /api/auth/logout | Clear auth cookie |
| `getMe` | GET /api/auth/me | Get current user info |

**Register Flow:**
```
Request → Validate input → Check email exists → Create user → Hash password (pre-save) 
        → Generate token → Set cookie → Send response
```

**Login Flow:**
```
Request → Find user by email → Compare passwords → Generate token → Set cookie → Send response
```

---

### 8. `src/controllers/call.controller.js` - Room Management

**Purpose:** Handle video call room operations

**Storage:** In-memory Map (`activeRooms`)

**Endpoints:**

| Function | Route | Description |
|----------|-------|-------------|
| `createRoom` | POST /api/call/create-room | Generate unique room ID |
| `joinRoom` | POST /api/call/join-room | Validate room exists |
| `getRoomInfo` | GET /api/call/room/:roomId | Get room details |

**Create Room Flow:**
```
Request → Generate random 16-char hex ID → Store in activeRooms Map → Return roomId
```

---

### 9. `src/routes/auth.routes.js` - Auth Routes

**Purpose:** Define authentication API endpoints

**Routes:**
```
POST /api/auth/register  → [register]           (Public)
POST /api/auth/login     → [login]              (Public)
POST /api/auth/logout    → [protect, logout]    (Protected)
GET  /api/auth/me        → [protect, getMe]     (Protected)
```

---

### 10. `src/routes/call.routes.js` - Call Routes

**Purpose:** Define call management API endpoints

**Routes:**
```
All routes require authentication (router.use(protect))

POST /api/call/create-room    → [createRoom]
POST /api/call/join-room      → [joinRoom]
GET  /api/call/room/:roomId   → [getRoomInfo]
```

---

### 11. `src/socket/socket.js` - Real-time Signaling

**Purpose:** Handle WebRTC signaling via Socket.IO

**This is the core of the video calling functionality!**

**Connected Users Tracking:**
```javascript
connectedUsers = Map<userId, { socketId, userName, roomId }>
```

**Socket Events:**

| Event | Direction | Purpose |
|-------|-----------|---------|
| `join-room` | Client → Server | Join a video call room |
| `user-joined` | Server → Client | Notify existing users of new participant |
| `room-users` | Server → Client | Send room participants to joining user |
| `offer` | Client → Server → Client | Send WebRTC offer |
| `answer` | Client → Server → Client | Send WebRTC answer |
| `ice-candidate` | Client → Server → Client | Exchange ICE candidates |
| `leave-room` | Client → Server | User leaves room |
| `toggle-media` | Client → Server → Client | Mute/unmute notification |

**WebRTC Signaling Flow:**
```
┌──────────────────────────────────────────────────────────────┐
│  User A (Caller)                    User B (Joiner)          │
│       │                                   │                  │
│       │──────── join-room ───────────────▶│                  │
│       │◀─────── room-users ──────────────│                   │
│       │                                   │                  │
│       │◀─────── user-joined ─────────────│ (B joins)         │
│       │                                   │                  │
│       │──────── offer ──────────────────▶│                   │
│       │◀─────── answer ─────────────────│                    │
│       │                                   │                  │
│       │◀──── ice-candidates ────────────▶│                   │
│       │                                   │                  │
│       │═══════ CONNECTED ═══════════════│                    │
└──────────────────────────────────────────────────────────────┘
```

**Cleanup Handling:**
- `leave-room` event: User explicitly leaves
- `disconnect` event: Browser closed, network lost
- Duplicate detection: Same user in multiple tabs blocked

---

## 🔐 Security Features

1. **Password Hashing:** bcrypt with 12 salt rounds
2. **JWT in httpOnly Cookies:** Prevents XSS attacks
3. **CORS Configuration:** Only allows specified frontend origin
4. **Helmet Middleware:** Sets security HTTP headers
5. **Input Validation:** All inputs validated before processing
6. **sameSite: 'none' + secure: true:** Safe cross-origin cookies

---

## 🌐 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | mongodb+srv://... |
| `PORT` | Server port | 5000 |
| `JWT_SECRET` | Secret for signing JWTs | your_secret_key |
| `FRONTEND_URL` | Allowed frontend origin | https://your-app.vercel.app |
| `NODE_ENV` | Environment mode | production |

---

## 🔄 Request Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Register/Login → auth.controller → User.model → token.js → Cookie Set  │
│                                                                          │
│  Protected Request → auth.middleware → Verify Cookie → Continue         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           VIDEO CALL FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Create Room → call.controller → Generate ID → Store in Memory          │
│                                                                          │
│  Join Room → Socket.IO → socket.js → Room Validation → User Added       │
│                                                                          │
│  Signaling → offer/answer/ice-candidate → Relay to Other Users          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```
