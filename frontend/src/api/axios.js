// Axios Instance Configuration
// Sets up axios with credentials for cookie-based authentication

import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    withCredentials: true, // CRITICAL: Enables cookies to be sent with requests
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000, // 10 second timeout
});

// Request Interceptor
// Can be used to add auth headers or modify requests
api.interceptors.request.use(
    (config) => {
        // You can add custom logic here if needed
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor
// Handles common errors like 401 (unauthorized)
api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        // Handle specific error cases
        if (error.response) {
            const { status } = error.response;

            // Unauthorized - token expired or invalid
            if (status === 401) {
                // Could trigger logout or redirect here
                console.warn('Unauthorized request - token may be expired');
            }

            // Server error
            if (status >= 500) {
                console.error('Server error:', error.response.data);
            }
        } else if (error.request) {
            // Network error
            console.error('Network error - no response received');
        }

        return Promise.reject(error);
    }
);

export default api;
