// Axios Instance Configuration
// Cookie-only authentication (httpOnly cookies)
//
// HOW IT WORKS:
// - Local dev: Vite proxy forwards /api/* to localhost:5000 (same origin, cookies are first-party)
//   No VITE_API_URL needed — defaults to '/api' which goes through proxy
// - Production: Set VITE_API_URL to full backend URL (e.g., https://your-backend.onrender.com/api)
//   Cross-domain cookies work with sameSite:'none' + secure:true
// - withCredentials: true ensures cookies are sent with every request
//
// RETRY LOGIC: Handles MongoDB cold starts on free tier hosting

import axios from 'axios';

// Create axios instance
// Local dev: '/api' (Vite proxy handles it)
// Production: full backend URL from env var
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    withCredentials: true, // CRITICAL: sends httpOnly cookies with every request
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000, // 30s timeout (allows for cold start on free tier hosting)
});

// Retry config
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

// Helper to check if error is retryable (network/timeout issues)
const isRetryableError = (error) => {
    return (
        !error.response || // Network error (no response)
        error.code === 'ECONNABORTED' || // Timeout
        error.code === 'ERR_NETWORK' || // Network failure
        (error.response && error.response.status >= 500) // Server error
    );
};

// Request interceptor to add retry metadata
api.interceptors.request.use((config) => {
    config._retryCount = config._retryCount || 0;
    return config;
});

// Response Interceptor with retry logic
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;

        // Retry logic for network/timeout errors
        if (config && isRetryableError(error) && config._retryCount < MAX_RETRIES) {
            config._retryCount += 1;
            console.log(`Retrying request (${config._retryCount}/${MAX_RETRIES})...`);

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

            return api(config);
        }

        // Log errors
        if (error.response) {
            if (error.response.status >= 500) {
                console.error('Server error:', error.response.data);
            }
        } else if (error.request) {
            console.error('Network error - no response received');
        }

        return Promise.reject(error);
    }
);

export default api;
