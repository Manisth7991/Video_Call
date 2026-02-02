// CallRoom Page
// The main video call interface with WebRTC functionality
//
// IDENTITY MANAGEMENT:
// - currentUser (from useAuth): The logged-in user on THIS client
// - remoteUser (state): The OTHER participant in the call
//
// RULE: remoteUser must NEVER be set to currentUser's data.
// All remoteUser data comes from socket events which contain
// the OTHER user's information (never our own).
//
// CLEANUP STRATEGY:
// This component handles cleanup in multiple scenarios:
// 1. Normal leave: User clicks "Leave Call" button
// 2. Navigation away: User navigates to another page
// 3. Page refresh/close: Browser beforeunload event
// 4. Tab visibility change: User switches tabs (optional pause)
// 5. Network disconnect: Connection lost
// 6. Remote peer disconnect: Other user leaves
//
// All scenarios must properly release camera/mic and notify the server.

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useSocket from '../hooks/useSocket';
import useWebRTC from '../hooks/useWebRTC';
import VideoPlayer from '../components/VideoPlayer';
import Controls from '../components/Controls';
import './CallRoom.css';

const CallRoom = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();

    // currentUser: The authenticated user on THIS client
    // This is OUR identity - never use this for remoteUser
    const { user: currentUser } = useAuth();

    // Connection states
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState('');

    // remoteUser: The OTHER participant in the call
    // MUST be populated ONLY from socket event data
    // NEVER set this to currentUser's data
    //
    // IDENTITY LOCK: Once set, remoteUser should NOT be overwritten
    // by subsequent events (offer/answer) to prevent race conditions
    const [remoteUser, setRemoteUser] = useState(null);
    const [copied, setCopied] = useState(false);

    // ROLE TRACKING:
    // - CALLER: The user who was already in the room when another user joined
    //           Receives 'user-joined' event → Creates and sends offer
    // - JOINER: The user who joined an existing room
    //           Receives 'room-users' event → Waits for offer, sends answer
    //
    // This ref ensures deterministic signaling regardless of join timing
    const roleRef = useRef(null); // 'caller' | 'joiner' | null

    // IDENTITY LOCK: Prevents remoteUser from being overwritten
    // Once remoteUser is set, this becomes true and blocks further updates
    const remoteUserLockedRef = useRef(false);

    // Refs for cleanup - using refs to ensure we have latest values in event handlers
    const cleanupPerformedRef = useRef(false);
    const roomIdRef = useRef(roomId);
    const socketRef = useRef(null);

    // Keep roomId ref updated
    useEffect(() => {
        roomIdRef.current = roomId;
    }, [roomId]);

    // Initialize socket connection
    const { socket, isConnected } = useSocket();

    // Keep socket ref updated
    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);

    // Initialize WebRTC
    const {
        localStream,
        remoteStream,
        isAudioEnabled,
        isVideoEnabled,
        connectionState,
        toggleAudio,
        toggleVideo,
        initializeMedia,
        createPeerConnection,
        createOffer,
        handleOffer,
        handleAnswer,
        handleIceCandidate,
        cleanup,
        handlePeerDisconnect,
        setOnIceCandidate,
    } = useWebRTC();

    // Copy room ID to clipboard
    const copyRoomId = useCallback(() => {
        navigator.clipboard.writeText(roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [roomId]);

    // CLEANUP: Comprehensive cleanup function
    // Called on leave, unmount, and page close
    const performCleanup = useCallback(() => {
        // Prevent multiple cleanup calls
        if (cleanupPerformedRef.current) {
            console.log('⏭️ Cleanup already performed, skipping...');
            return;
        }
        cleanupPerformedRef.current = true;

        console.log('🧹 Performing comprehensive cleanup...');

        // STEP 1: Notify server we're leaving the room
        // Using ref to ensure we have the latest socket instance
        const currentSocket = socketRef.current;
        const currentRoomId = roomIdRef.current;

        if (currentSocket && currentRoomId) {
            try {
                currentSocket.emit('leave-room', { roomId: currentRoomId });
                console.log('📤 Sent leave-room event');
            } catch (e) {
                console.error('Error emitting leave-room:', e);
            }
        }

        // STEP 2: Cleanup WebRTC resources (camera, mic, peer connection)
        cleanup();

        console.log('✅ Comprehensive cleanup complete');
    }, [cleanup]);

    // Leave the call and navigate back to dashboard
    // Triggered by user clicking "Leave Call" button
    const handleLeaveCall = useCallback(() => {
        performCleanup();
        navigate('/dashboard');
    }, [performCleanup, navigate]);

    // CLEANUP: Handle page refresh/close (beforeunload)
    // This ensures cleanup happens even if user closes the tab
    useEffect(() => {
        const handleBeforeUnload = (event) => {
            console.log('🚪 Page unload detected - cleaning up...');

            // Perform synchronous cleanup for beforeunload
            const currentSocket = socketRef.current;
            const currentRoomId = roomIdRef.current;

            if (currentSocket && currentRoomId) {
                // Use sendBeacon for reliable delivery during page unload
                // Fallback to emit if sendBeacon not available
                try {
                    currentSocket.emit('leave-room', { roomId: currentRoomId });
                } catch (e) {
                    console.error('Error during beforeunload cleanup:', e);
                }
            }

            // Stop media tracks immediately
            cleanup();
        };

        // Add event listener for page unload
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [cleanup]);

    // CLEANUP: Handle visibility change (tab switch)
    // Optional: Pause video when tab is not visible to save bandwidth
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                console.log('👁️ Tab hidden - call continues in background');
                // Optional: Could pause video here to save bandwidth
                // The audio continues so the call isn't interrupted
            } else {
                console.log('👁️ Tab visible again');
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Initialize media and join room when socket connects
    useEffect(() => {
        const setupCall = async () => {
            if (!socket || !isConnected) return;

            try {
                setIsConnecting(true);
                setError('');
                // Reset cleanup flag for new call
                cleanupPerformedRef.current = false;
                // Reset role and identity lock for new call
                roleRef.current = null;
                remoteUserLockedRef.current = false;

                // Get user media (camera + microphone)
                await initializeMedia();

                // Join the socket room
                socket.emit('join-room', { roomId });

                setIsConnecting(false);
            } catch (err) {
                console.error('Setup error:', err);
                setError('Failed to access camera/microphone. Please allow permissions.');
                setIsConnecting(false);
            }
        };

        setupCall();

        // CLEANUP: On unmount, perform full cleanup
        return () => {
            console.log('🔄 Component unmounting - performing cleanup...');
            performCleanup();
        };
    }, [socket, isConnected, roomId, initializeMedia, performCleanup]);

    // Handle socket events for WebRTC signaling
    //
    // CRITICAL IDENTITY RULES:
    // 1. All socket events contain the OTHER user's identity, not ours
    // 2. Always guard against accidentally setting remoteUser to currentUser
    // 3. Log identity info for debugging
    useEffect(() => {
        if (!socket || !currentUser) return;

        // Helper: Safely set remote user with identity guard and lock
        // - Prevents setting remoteUser to our own identity
        // - Once locked, prevents overwrites from subsequent events
        //
        // @param {Object} userData - { odtId, userName }
        // @param {string} source - Event name for logging
        // @param {boolean} canLock - If true, this event can lock the identity
        // @returns {boolean} - Whether the update was applied
        const safeSetRemoteUser = (userData, source, canLock = false) => {
            const { odtId, userName } = userData;

            // GUARD: Never set remoteUser to our own identity
            if (odtId === currentUser.id) {
                console.warn(`⚠️ [${source}] Blocked attempt to set remoteUser to self (${userName})`);
                return false;
            }

            // GUARD: If identity is already locked, don't overwrite
            if (remoteUserLockedRef.current) {
                console.log(`🔒 [${source}] Identity already locked, ignoring update for: ${userName}`);
                return false;
            }

            setRemoteUser({ odtId, userName });
            console.log(`👤 [${source}] Setting remoteUser: ${userName} (ID: ${odtId})`);

            // Lock identity if this is a locking event (user-joined or room-users)
            if (canLock) {
                remoteUserLockedRef.current = true;
                console.log(`🔒 [${source}] Identity LOCKED to: ${userName}`);
            }

            return true;
        };

        // EVENT: user-joined
        // Triggered when ANOTHER user joins the room we're in
        //
        // ROLE: We become the CALLER (we were here first)
        // IDENTITY: Contains the JOINING user's info (not ours)
        // ACTION: Set them as remoteUser, lock identity, create and send offer
        const handleUserJoined = async ({ odtId, userName }) => {
            console.log(`👋 [user-joined] User joined: ${userName} (ID: ${odtId})`);

            // Set our role as CALLER (we were in room first, other user joined)
            roleRef.current = 'caller';
            console.log('🎭 Role assigned: CALLER (will create offer)');

            // Set the joining user as our remote user and LOCK the identity
            if (safeSetRemoteUser({ odtId, userName }, 'user-joined', true)) {
                // CALLER: Create peer connection and send offer
                createPeerConnection();
                const offer = await createOffer();
                if (offer) {
                    socket.emit('offer', { offer, roomId });
                    console.log('📤 Offer sent to room');
                }
            }
        };

        // EVENT: offer
        // Triggered when we receive a WebRTC offer from another user
        //
        // ROLE: We are the JOINER (we received an offer)
        // IDENTITY: Contains the CALLER's info (the one who sent the offer)
        // ACTION: DO NOT update remoteUser here (should already be set from room-users)
        //         Just handle the offer and send answer
        const handleReceiveOffer = async ({ offer, from, userName }) => {
            console.log(`📥 [offer] Received offer from: ${userName} (ID: ${from})`);

            // Verify we're the JOINER
            if (roleRef.current !== 'joiner') {
                console.warn(`⚠️ [offer] Unexpected offer - current role: ${roleRef.current}`);
            }

            // IDENTITY FALLBACK (SECONDARY SOURCE):
            // If remoteUser is still null AND identity is not locked,
            // use the offer's sender info as a fallback.
            // This handles race conditions where room-users event was missed.
            if (!remoteUserLockedRef.current) {
                console.log(`🔄 [offer] FALLBACK: Identity not set from room-users, using offer metadata`);
                const applied = safeSetRemoteUser({ odtId: from, userName }, 'offer-fallback', true);
                if (applied) {
                    console.log(`✅ [offer] Fallback identity applied: ${userName}`);
                }
            }

            // JOINER: Handle offer and create answer
            const answer = await handleOffer(offer);
            if (answer) {
                socket.emit('answer', { answer, to: from, roomId });
                console.log('📤 Answer sent to caller');
            }
        };

        // EVENT: answer
        // Triggered when we receive a WebRTC answer from the callee
        //
        // ROLE: We are the CALLER (we sent the offer)
        // IDENTITY: Contains the CALLEE's info (the one who answered)
        // ACTION: DO NOT update remoteUser here (should already be set from user-joined)
        //         Just handle the answer to complete connection
        const handleReceiveAnswer = async ({ answer, from, userName }) => {
            console.log(`📥 [answer] Received answer from: ${userName} (ID: ${from})`);

            // Verify we're the CALLER
            if (roleRef.current !== 'caller') {
                console.warn(`⚠️ [answer] Unexpected answer - current role: ${roleRef.current}`);
            }

            // IDENTITY FALLBACK (SECONDARY SOURCE):
            // If remoteUser is still null AND identity is not locked,
            // use the answer's sender info as a fallback.
            // This handles race conditions where user-joined event was missed.
            if (!remoteUserLockedRef.current) {
                console.log(`🔄 [answer] FALLBACK: Identity not set from user-joined, using answer metadata`);
                const applied = safeSetRemoteUser({ odtId: from, userName }, 'answer-fallback', true);
                if (applied) {
                    console.log(`✅ [answer] Fallback identity applied: ${userName}`);
                }
            }

            await handleAnswer(answer);
            console.log('✅ Answer processed, connection establishing...');
        };

        // EVENT: ice-candidate
        // Triggered when we receive ICE candidates for connection establishment
        const handleReceiveIceCandidate = ({ candidate, from }) => {
            if (candidate) {
                handleIceCandidate(candidate);
            }
        };

        // EVENT: user-left
        // Triggered when the remote user leaves the call
        // ACTION: Clear remoteUser and unlock identity for potential new user
        const handleUserLeft = ({ odtId, userName }) => {
            console.log(`👋 [user-left] User left: ${userName} (ID: ${odtId})`);
            setRemoteUser(null);
            // Unlock identity so a new user can join
            remoteUserLockedRef.current = false;
            roleRef.current = null;
            handlePeerDisconnect();
        };

        // EVENT: room-users
        // Triggered when WE join a room that already has participants
        //
        // ROLE: We become the JOINER (room already had users)
        // IDENTITY: Contains OTHER participants' info (never includes us)
        // ACTION: Set the first participant as remoteUser, lock identity, wait for offer
        //
        // NOTE: JOINER does NOT create offer - waits for CALLER to send offer
        const handleRoomUsers = async ({ participants }) => {
            console.log(`📋 [room-users] Existing participants:`, participants);

            if (participants && participants.length > 0) {
                // Filter out ourselves (extra safety)
                const others = participants.filter(p => p.odtId !== currentUser.id);

                if (others.length > 0) {
                    // Set our role as JOINER (room already had participants)
                    roleRef.current = 'joiner';
                    console.log('🎭 Role assigned: JOINER (will wait for offer)');

                    const existingUser = others[0];
                    // Set remoteUser and LOCK the identity
                    safeSetRemoteUser({
                        odtId: existingUser.odtId,
                        userName: existingUser.userName,
                    }, 'room-users', true);

                    // JOINER: Create peer connection but DO NOT create offer
                    // Wait for the CALLER to send us an offer
                    createPeerConnection();
                    console.log('⏳ Peer connection ready, waiting for offer from CALLER...');
                } else {
                    console.log('📋 [room-users] No other participants - we are first in room');
                }
            } else {
                console.log('📋 [room-users] Empty room - we are first in room');
            }
        };

        // EVENT: error
        // Triggered on socket errors
        const handleError = ({ message }) => {
            console.error('❌ [error] Socket error:', message);
            setError(message);
        };

        // EVENT: user-toggle-media
        // Triggered when remote user mutes/unmutes audio or video
        const handleUserToggleMedia = ({ odtId, type, enabled }) => {
            console.log(`🔄 [user-toggle-media] Remote user toggled ${type}: ${enabled}`);
        };

        // EVENT: disconnect
        // Triggered on socket disconnection
        const handleDisconnect = (reason) => {
            console.log('⚠️ [disconnect] Socket disconnected:', reason);

            if (reason === 'io server disconnect') {
                setError('Disconnected from server');
            } else if (reason === 'transport close' || reason === 'ping timeout') {
                console.log('Network issue - waiting for reconnection...');
            }
        };

        // Log current user identity for debugging
        console.log(`🔐 Current user identity: ${currentUser.name} (ID: ${currentUser.id})`);

        // Register event listeners
        socket.on('user-joined', handleUserJoined);
        socket.on('offer', handleReceiveOffer);
        socket.on('answer', handleReceiveAnswer);
        socket.on('ice-candidate', handleReceiveIceCandidate);
        socket.on('user-left', handleUserLeft);
        socket.on('room-users', handleRoomUsers);
        socket.on('error', handleError);
        socket.on('user-toggle-media', handleUserToggleMedia);
        socket.on('disconnect', handleDisconnect);

        // CLEANUP: Remove all event listeners on unmount
        return () => {
            socket.off('user-joined', handleUserJoined);
            socket.off('offer', handleReceiveOffer);
            socket.off('answer', handleReceiveAnswer);
            socket.off('ice-candidate', handleReceiveIceCandidate);
            socket.off('user-left', handleUserLeft);
            socket.off('room-users', handleRoomUsers);
            socket.off('error', handleError);
            socket.off('user-toggle-media', handleUserToggleMedia);
            socket.off('disconnect', handleDisconnect);
        };
    }, [socket, roomId, currentUser, createPeerConnection, createOffer, handleOffer, handleAnswer, handleIceCandidate, handlePeerDisconnect]);

    // Set up ICE candidate callback to emit candidates via socket
    useEffect(() => {
        if (!socket || !roomId) return;

        // Set the callback that will be called when ICE candidates are generated
        setOnIceCandidate((candidate) => {
            console.log('📤 Emitting ICE candidate via socket');
            socket.emit('ice-candidate', {
                candidate,
                roomId,
            });
        });

        return () => {
            // Clear the callback on cleanup
            setOnIceCandidate(null);
        };
    }, [socket, roomId, setOnIceCandidate]);

    // Handle media toggle with socket notification
    const handleToggleAudio = () => {
        const newState = toggleAudio();
        if (socket) {
            socket.emit('toggle-media', { roomId, type: 'audio', enabled: newState });
        }
    };

    const handleToggleVideo = () => {
        const newState = toggleVideo();
        if (socket) {
            socket.emit('toggle-media', { roomId, type: 'video', enabled: newState });
        }
    };

    // Loading state
    if (isConnecting) {
        return (
            <div className="call-room loading">
                <div className="loading-content">
                    <div className="spinner"></div>
                    <h2>Setting up your call...</h2>
                    <p>Please allow camera and microphone access</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="call-room error">
                <div className="error-content">
                    <h2>⚠️ Error</h2>
                    <p>{error}</p>
                    <button onClick={() => navigate('/dashboard')} className="back-button">
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="call-room">
            {/* Header with room info */}
            <header className="call-header">
                <div className="room-info">
                    <span className="room-label">Room ID:</span>
                    <code className="room-id">{roomId}</code>
                    <button onClick={copyRoomId} className="copy-button">
                        {copied ? '✓ Copied' : '📋 Copy'}
                    </button>
                </div>
                <div className="call-status">
                    {remoteUser ? (
                        <span className="connected">🟢 Connected with {remoteUser.userName}</span>
                    ) : (
                        <span className="waiting">🟡 Waiting for someone to join...</span>
                    )}
                </div>
            </header>

            {/* Video Container */}
            <main className="videos-container">
                {/* Remote Video (Large) */}
                <div className="remote-video-wrapper">
                    {remoteStream ? (
                        <VideoPlayer
                            stream={remoteStream}
                            muted={false}
                            label={remoteUser?.userName || 'Remote User'}
                        />
                    ) : (
                        <div className="video-placeholder">
                            <div className="placeholder-content">
                                <span className="placeholder-icon">👤</span>
                                <p>Waiting for participant...</p>
                                <p className="small">Share the room ID to invite someone</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Local Video (Small, Picture-in-Picture style) */}
                <div className="local-video-wrapper">
                    <VideoPlayer
                        stream={localStream}
                        muted={true} // Mute local video to prevent echo
                        label="You"
                        isLocal={true}
                    />
                </div>
            </main>

            {/* Controls */}
            <Controls
                isAudioEnabled={isAudioEnabled}
                isVideoEnabled={isVideoEnabled}
                onToggleAudio={handleToggleAudio}
                onToggleVideo={handleToggleVideo}
                onLeaveCall={handleLeaveCall}
            />
        </div>
    );
};

export default CallRoom;
