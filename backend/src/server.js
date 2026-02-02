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

// Socket.IO Configuration
// Enables real-time bidirectional communication
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Video Call Server Running!                           ║
║                                                           ║
║   📍 HTTP Server:  http://localhost:${PORT}                 ║
║   🔌 Socket.IO:    Enabled                                ║
║   🗄️  MongoDB:      Connected                              ║
║   🔒 Auth:         JWT + httpOnly Cookies                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
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
