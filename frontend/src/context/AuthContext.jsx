// Authentication Context
// Manages user authentication state across the application
// Provides login, register, logout functions and user state

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAuthToken, removeAuthToken } from '../api/axios';

// Create the context
const AuthContext = createContext(null);

// AuthProvider Component
// Wraps the application and provides auth state
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check if user is already authenticated (on app load)
    // Calls /api/auth/me to verify the cookie-stored JWT or Authorization header
    const checkAuth = useCallback(async () => {
        try {
            setLoading(true);

            // Always try the API call - cookies might work even without localStorage token
            // This handles users who logged in before the localStorage fallback was added
            const response = await api.get('/auth/me');

            if (response.data.success) {
                setUser(response.data.user);
                // CRITICAL: Store token from response for future cross-origin requests
                // This ensures localStorage gets populated for users who only had cookies
                if (response.data.token) {
                    setAuthToken(response.data.token);
                }
            }
        } catch (err) {
            // Not authenticated - clear token and user state
            removeAuthToken();
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Check authentication on mount
    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // Register a new user
    // @param {Object} userData - { name, email, password }
    const register = async (userData) => {
        try {
            setError(null);
            setLoading(true);

            const response = await api.post('/auth/register', userData);

            if (response.data.success) {
                // Store the token in localStorage as fallback for cross-origin cookie issues
                if (response.data.token) {
                    setAuthToken(response.data.token);
                }
                setUser(response.data.user);
                return { success: true };
            }
        } catch (err) {
            const message = err.response?.data?.message || 'Registration failed';
            setError(message);
            return { success: false, message };
        } finally {
            setLoading(false);
        }
    };

    // Login user
    // @param {Object} credentials - { email, password }
    const login = async (credentials) => {
        try {
            setError(null);
            setLoading(true);

            const response = await api.post('/auth/login', credentials);

            if (response.data.success) {
                // Store the token in localStorage as fallback for cross-origin cookie issues
                if (response.data.token) {
                    setAuthToken(response.data.token);
                }
                setUser(response.data.user);
                return { success: true };
            }
        } catch (err) {
            const message = err.response?.data?.message || 'Login failed';
            setError(message);
            return { success: false, message };
        } finally {
            setLoading(false);
        }
    };

    // Logout user
    // Clears the httpOnly cookie on the server and localStorage token
    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            removeAuthToken(); // Clear the localStorage token
            setUser(null);
            setError(null);
        }
    };

    // Clear any authentication errors
    const clearError = () => setError(null);

    // Context value
    const value = {
        user,
        loading,
        error,
        isAuthenticated: !!user,
        register,
        login,
        logout,
        clearError,
        checkAuth,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook to use auth context
// @returns {Object} Auth context value
export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
};

export default AuthContext;
