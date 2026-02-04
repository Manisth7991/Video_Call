// useSocket Hook
// Manages Socket.IO connection for real-time signaling
//
// SOCKET LIFECYCLE:
// 1. Create connection on mount with authentication
// 2. Handle connection/reconnection events
// 3. Provide socket instance to components
// 4. Cleanup on unmount - disconnect gracefully
//
// CLEANUP REQUIREMENTS:
// - Disconnect socket to free server resources
// - Remove all event listeners to prevent memory leaks
// - Clear references to allow garbage collection

import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getAuthToken } from '../api/axios';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const useSocket = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const socketRef = useRef(null);
    // Track if component is mounted to prevent state updates after unmount
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;

        // Get the auth token for socket authentication
        const token = getAuthToken();

        // Create socket connection with credentials
        const socket = io(SOCKET_URL, {
            withCredentials: true, // Send cookies for authentication
            transports: ['websocket', 'polling'], // Prefer WebSocket
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            // Timeout settings for better cleanup detection
            timeout: 10000,
            // Disconnect if ping not received
            pingTimeout: 5000,
            pingInterval: 25000,
            // Pass token via auth for cross-origin fallback
            auth: {
                token: token,
            },
        });

        socketRef.current = socket;

        // Connection successful
        const handleConnect = () => {
            if (isMountedRef.current) {
                setIsConnected(true);
                setConnectionError(null);
            }
        };

        // Disconnection handler
        const handleDisconnect = (reason) => {
            if (isMountedRef.current) {
                setIsConnected(false);
            }
        };

        // Connection error handler
        const handleConnectError = (error) => {
            console.error('🔌 Socket connection error:', error.message);
            if (isMountedRef.current) {
                setConnectionError(error.message);
                setIsConnected(false);
            }
        };

        // Reconnection successful
        const handleReconnect = (attemptNumber) => {
            if (isMountedRef.current) {
                setIsConnected(true);
                setConnectionError(null);
            }
        };

        // Reconnection attempt failed
        const handleReconnectError = (error) => {
            console.error('🔌 Socket reconnection error:', error);
        };

        // All reconnection attempts failed
        const handleReconnectFailed = () => {
            console.error('🔌 Socket reconnection failed - all attempts exhausted');
            if (isMountedRef.current) {
                setConnectionError('Unable to connect to server. Please refresh the page.');
            }
        };

        // Register event handlers
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        socket.on('reconnect', handleReconnect);
        socket.on('reconnect_error', handleReconnectError);
        socket.on('reconnect_failed', handleReconnectFailed);

        // CLEANUP: Comprehensive socket cleanup on unmount
        //
        // WHY CLEANUP IS CRITICAL:
        // 1. Server resources: Keeps connection open, consuming server memory
        // 2. Event listeners: Can cause memory leaks and zombie callbacks
        // 3. Reconnection: May try to reconnect to a component that no longer exists
        return () => {
            isMountedRef.current = false;

            // Remove all event listeners first
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleConnectError);
            socket.off('reconnect', handleReconnect);
            socket.off('reconnect_error', handleReconnectError);
            socket.off('reconnect_failed', handleReconnectFailed);

            // Disconnect the socket
            if (socket.connected) {
                socket.disconnect();
            }

            // Clear the reference
            socketRef.current = null;
        };
    }, []);

    // Manual disconnect function
    // Can be called to disconnect without unmounting
    const disconnect = useCallback(() => {
        if (socketRef.current?.connected) {
            socketRef.current.disconnect();
        }
    }, []);

    // Manual reconnect function
    // Can be called to attempt reconnection
    const reconnect = useCallback(() => {
        if (socketRef.current && !socketRef.current.connected) {
            socketRef.current.connect();
        }
    }, []);

    return {
        socket: socketRef.current,
        isConnected,
        connectionError,
        disconnect,
        reconnect,
    };
};

export default useSocket;
