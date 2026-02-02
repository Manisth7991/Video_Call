
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Connect to MongoDB using the URI from environment variables
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // These options ensure stable connection behavior
            maxPoolSize: 10, // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 10000, // Timeout after 10s instead of 30s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
            retryWrites: true, // Retry failed writes
            retryReads: true, // Retry failed reads
            family: 4, // Use IPv4, skip trying IPv6 (helps with DNS issues)
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error(`❌ MongoDB connection error: ${err.message}`);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        console.error('💡 Tips to fix:');
        console.error('   1. Check your internet connection');
        console.error('   2. Verify MONGO_URI in .env file is correct');
        console.error('   3. If using MongoDB Atlas, ensure cluster is not paused');
        console.error('   4. Check if your IP is whitelisted in MongoDB Atlas');
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;
