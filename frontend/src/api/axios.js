// Axios Instance Configuration
// Cookie-only authentication (httpOnly cookies)
//
// HOW IT WORKS:
// - Local dev: Vite proxy forwards /api/* to localhost:5000 (same origin, cookies are first-party)
//   No VITE_API_URL needed — defaults to '/api' which goes through proxy
// - Production: Set VITE_API_URL to full backend URL (e.g., https://your-backend.onrender.com/api)
//   Cross-domain cookies work with sameSite:'none' + secure:true
// - withCredentials: true ensures cookies are sent with every request

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
    timeout: 10000,
});

// Response Interceptor
api.interceptors.response.use(
    (response) => response,
    (error) => {
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
