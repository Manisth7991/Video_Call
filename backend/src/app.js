// Express Application Configuration
// Sets up middleware, routes, and CORS

// DEPLOYMENT REQUIREMENTS:
// - Set FRONTEND_URL env variable to exact Vercel URL (e.g., https://your-app.vercel.app)
// - Set NODE_ENV=production for proper cookie security
// - Ensure HTTPS enabled on both frontend and backend

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
// CRITICAL for cross-domain cookie auth:
// - Must specify exact origin (not '*')
// - credentials: true is REQUIRED for cookies
// - For production: use your Vercel URL
// - For development: use localhost
const allowedOrigins = [
    process.env.FRONTEND_URL,           // Production Vercel URL (e.g., https://your-app.vercel.app)
    'http://localhost:5173',            // Local development
    'http://localhost:3000',
    'http://localhost:5174',
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (Postman, mobile apps, curl)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // Allow any Vercel deployment URL (for preview deployments)
        if (origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }

        // Block other origins
        console.log('❌ CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // CRITICAL: Required for cookies to work cross-domain
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'], // Expose Set-Cookie header to frontend
};

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors(corsOptions));
app.use(express.json({ limit:'10kb' })); // Parse JSON with size limit
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
