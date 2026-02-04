// Server Entry Point
// Initializes database, HTTP server, and Socket.IO

require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const { initializeSocket } = require('./socket/socket');

// Get port from environment
const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Allowed origins for Socket.IO
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
];

// Socket.IO Configuration
// Enables real-time bidirectional communication
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
    pingTimeout: 60000, // How long to wait for pong response
    pingInterval: 25000, // How often to send ping
});

// Start the server
const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Initialize Socket.IO handlers
        initializeSocket(io);

        // Start listening
        server.listen(PORT, () => {
            console.log(`Server is listening`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});

// Start the server
startServer();
