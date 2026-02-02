// Authentication Context
// Manages user authentication state across the application
// Provides login, register, logout functions and user state

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

// Create the context
const AuthContext = createContext(null);

// AuthProvider Component
// Wraps the application and provides auth state
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check if user is already authenticated (on app load)
    // Calls /api/auth/me to verify the cookie-stored JWT
    const checkAuth = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/auth/me');

            if (response.data.success) {
                setUser(response.data.user);
            }
        } catch (err) {
            // Not authenticated - this is expected for new users
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
    // Clears the httpOnly cookie on the server
    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
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
