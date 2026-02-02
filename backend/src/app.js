// Express Application Configuration
// Sets up middleware, routes, and CORS

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

// Import routes
const authRoutes = require('./routes/auth.routes');
const callRoutes = require('./routes/call.routes');

// Create Express app
const app = express();

// CORS Configuration
// Allows frontend to make requests with credentials (cookies)
// Supports multiple Vercel deployment URLs
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
];

// Add Vercel preview URLs pattern
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // Allow any Vercel deployment URL for this project
        if (origin.includes('video-call') && origin.includes('vercel.app')) {
            return callback(null, true);
        }

        // Block other origins
        console.log('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // Allow cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' })); // Parse JSON with size limit
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Parse cookies

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/call', callRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Global Error Handler
// Catches all errors and sends safe response
app.use((err, req, res, next) => {
    console.error('Global Error:', err);

    // Don't leak error details in production
    const isProduction = process.env.NODE_ENV === 'production';

    res.status(err.status || 500).json({
        success: false,
        message: isProduction ? 'Internal server error' : err.message,
        ...(isProduction ? {} : { stack: err.stack }),
    });
});

module.exports = app;
