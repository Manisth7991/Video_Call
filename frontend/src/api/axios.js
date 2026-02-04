// Axios Instance Configuration
// Sets up axios with credentials for cookie-based authentication
// Also includes Authorization header fallback for cross-origin cookie issues

import axios from 'axios';

// Token storage key for localStorage fallback
const TOKEN_KEY = 'auth_token';

// Helper functions for token management
export const setAuthToken = (token) => {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    }
};

export const getAuthToken = () => {
    return localStorage.getItem(TOKEN_KEY);
};

export const removeAuthToken = () => {
    localStorage.removeItem(TOKEN_KEY);
};

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
// Adds Authorization header as fallback for cross-origin cookie issues
api.interceptors.request.use(
    (config) => {
        // Always add the token to Authorization header as fallback
        // This handles cases where cross-origin cookies don't work
        const token = getAuthToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
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
