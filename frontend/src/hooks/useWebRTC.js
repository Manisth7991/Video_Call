// useWebRTC Hook
// Manages WebRTC peer connection for video calls
//
// WEBRTC FLOW:
// 1. Get user media (camera + mic)
// 2. Create RTCPeerConnection
// 3. Add local tracks to connection
// 4. Create offer (caller) / answer (callee)
// 5. Exchange SDP (Session Description Protocol)
// 6. Exchange ICE candidates
// 7. Peer connection established!
//
// CLEANUP REQUIREMENTS:
// - Stop all media tracks to release camera/microphone
// - Close RTCPeerConnection to free network resources
// - Clear all state to prevent memory leaks
// - Allow clean re-initialization for new calls

import { useState, useRef, useCallback, useEffect } from 'react';

// STUN servers help discover public IP addresses
// These are free Google STUN servers
// In production, consider using TURN servers for NAT traversal
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
};

const useWebRTC = () => {
    // State for streams
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [connectionState, setConnectionState] = useState('new');

    // Refs for WebRTC objects - using refs to avoid stale closures
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    // Track if component is mounted to prevent state updates after unmount
    const isMountedRef = useRef(true);
    // Callback ref for ICE candidates - will be set by CallRoom
    const onIceCandidateRef = useRef(null);
    // Buffer for ICE candidates that arrive before remote description is set
    const pendingIceCandidatesRef = useRef([]);

    // CLEANUP: Effect to track component mount state
    // This prevents "setState on unmounted component" warnings
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Safely update state only if component is mounted
    const safeSetState = useCallback((setter, value) => {
        if (isMountedRef.current) {
            setter(value);
        }
    }, []);

    // CLEANUP: Stop all tracks in a media stream
    // This releases the camera and microphone hardware
    // @param {MediaStream} stream - The stream to stop
    const stopMediaTracks = useCallback((stream) => {
        if (stream) {
            stream.getTracks().forEach((track) => {
                // Stop each track individually
                track.stop();
                console.log(`🛑 Stopped ${track.kind} track: ${track.label}`);
            });
        }
    }, []);

    // CLEANUP: Close and cleanup peer connection
    // This releases network resources and ICE candidates
    const closePeerConnection = useCallback(() => {
        const pc = peerConnectionRef.current;
        if (pc) {
            // Remove all event listeners to prevent memory leaks
            pc.ontrack = null;
            pc.onicecandidate = null;
            pc.onconnectionstatechange = null;
            pc.oniceconnectionstatechange = null;
            pc.onsignalingstatechange = null;
            pc.onicegatheringstatechange = null;

            // Close the connection if not already closed
            if (pc.signalingState !== 'closed') {
                pc.close();
                console.log('🔌 Peer connection closed');
            }

            peerConnectionRef.current = null;
        }
    }, []);

    // Initialize media devices (camera + microphone)
    const initializeMedia = useCallback(async () => {
        try {
            // Request camera and microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user', // Front camera on mobile
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // Store stream in ref and state
            localStreamRef.current = stream;
            safeSetState(setLocalStream, stream);
            safeSetState(setIsAudioEnabled, true);
            safeSetState(setIsVideoEnabled, true);

            console.log('📹 Media initialized successfully');
            return stream;
        } catch (error) {
            console.error('Failed to get user media:', error);
            throw error;
        }
    }, [safeSetState]);

    // Create RTCPeerConnection with event handlers
    // IMPORTANT: localStream MUST exist before calling this
    // @returns {RTCPeerConnection|null} - The peer connection or null if no local stream
    const createPeerConnection = useCallback(() => {
        // GUARD: Ensure local media exists before creating peer connection
        // This prevents the race condition where offer is created without tracks
        if (!localStreamRef.current) {
            console.error('❌ Cannot create peer connection: localStream not initialized');
            return null;
        }

        // Close existing connection if any
        closePeerConnection();

        // Clear pending ICE candidates for fresh connection
        pendingIceCandidatesRef.current = [];

        // Create new peer connection with ICE servers
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // Add local tracks to the peer connection
        // At this point, localStreamRef.current is guaranteed to exist
        localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current);
            console.log(`➕ Added ${track.kind} track to peer connection`);
        });

        // Handle incoming remote tracks
        // This fires when the remote peer adds their media tracks
        pc.ontrack = (event) => {
            console.log('📥 Received remote track:', event.track.kind);
            const [stream] = event.streams;
            remoteStreamRef.current = stream;
            safeSetState(setRemoteStream, stream);
        };

        // Handle ICE candidates
        // ICE candidates are used to establish the connection path
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 New ICE candidate generated');
                // Call the callback if set (will emit to socket)
                if (onIceCandidateRef.current) {
                    onIceCandidateRef.current(event.candidate);
                }
            }
        };

        // Monitor connection state changes
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log('📡 Connection state:', state);
            safeSetState(setConnectionState, state);

            // Handle disconnection states
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                console.log('⚠️ Connection lost or closed');
            }
        };

        // Monitor ICE connection state
        pc.oniceconnectionstatechange = () => {
            console.log('🧊 ICE connection state:', pc.iceConnectionState);
        };

        return pc;
    }, [closePeerConnection, safeSetState]);

    // Create WebRTC offer (caller side)
    // SDP offer describes the media capabilities of the caller
    //
    // CALLER ONLY: Only the user who receives 'user-joined' should call this
    // PREREQUISITE: localStream must exist with tracks added
    const createOffer = useCallback(async () => {
        try {
            // GUARD: Ensure local media exists before creating offer
            if (!localStreamRef.current) {
                console.error('❌ Cannot create offer: localStream not initialized');
                return null;
            }

            let pc = peerConnectionRef.current;

            // Create peer connection if it doesn't exist
            if (!pc) {
                pc = createPeerConnection();
                // If createPeerConnection failed (no local stream), abort
                if (!pc) {
                    console.error('❌ Cannot create offer: peer connection creation failed');
                    return null;
                }
            }

            // Create offer SDP
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            });

            // Set as local description
            await pc.setLocalDescription(offer);

            console.log('📤 Created offer (CALLER role)');
            return offer;
        } catch (error) {
            console.error('Error creating offer:', error);
            return null;
        }
    }, [createPeerConnection]);

    // Flush pending ICE candidates that were buffered before remote description was set
    const flushPendingIceCandidates = useCallback(async () => {
        const pc = peerConnectionRef.current;
        if (!pc || !pc.remoteDescription) return;

        const candidates = pendingIceCandidatesRef.current;
        if (candidates.length > 0) {
            console.log(`🧊 Flushing ${candidates.length} pending ICE candidates`);
            pendingIceCandidatesRef.current = [];

            for (const candidate of candidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('🧊 Added buffered ICE candidate');
                } catch (error) {
                    if (error.name !== 'InvalidStateError') {
                        console.error('Error adding buffered ICE candidate:', error);
                    }
                }
            }
        }
    }, []);

    // Handle incoming offer and create answer (callee side)
    //
    // JOINER ONLY: Only the user who receives 'offer' event should call this
    // PREREQUISITE: localStream must exist with tracks added
    //
    // @param {RTCSessionDescriptionInit} offer - The received offer
    const handleOffer = useCallback(async (offer) => {
        try {
            // GUARD: Ensure local media exists before handling offer
            if (!localStreamRef.current) {
                console.error('❌ Cannot handle offer: localStream not initialized');
                return null;
            }

            let pc = peerConnectionRef.current;

            // Create new peer connection if needed
            if (!pc) {
                pc = createPeerConnection();
                // If createPeerConnection failed, abort
                if (!pc) {
                    console.error('❌ Cannot handle offer: peer connection creation failed');
                    return null;
                }
            }

            // Set the remote description (caller's offer)
            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            // Flush any pending ICE candidates now that remote description is set
            await flushPendingIceCandidates();

            // Create answer SDP
            const answer = await pc.createAnswer();

            // Set as local description
            await pc.setLocalDescription(answer);

            console.log('📤 Created answer (JOINER role)');
            return answer;
        } catch (error) {
            console.error('Error handling offer:', error);
            return null;
        }
    }, [createPeerConnection, flushPendingIceCandidates]);

    // Handle incoming answer (caller side)
    // @param {RTCSessionDescriptionInit} answer - The received answer
    const handleAnswer = useCallback(async (answer) => {
        try {
            const pc = peerConnectionRef.current;
            if (!pc) {
                console.error('No peer connection');
                return;
            }

            // Only set remote description if we haven't already
            if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('📥 Set remote description (answer)');
            }

            // Flush any pending ICE candidates now that remote description is set
            await flushPendingIceCandidates();
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }, [flushPendingIceCandidates]);

    // Handle incoming ICE candidate
    // Buffers candidates if remote description is not yet set
    // @param {RTCIceCandidateInit} candidate - The received ICE candidate
    const handleIceCandidate = useCallback(async (candidate) => {
        try {
            const pc = peerConnectionRef.current;
            if (!pc) {
                console.log('🧊 Buffering ICE candidate (no peer connection yet)');
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }

            // Buffer candidate if remote description is not set yet
            if (!pc.remoteDescription) {
                console.log('🧊 Buffering ICE candidate (no remote description yet)');
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }

            // Remote description is set, add candidate immediately
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('🧊 Added ICE candidate');
        } catch (error) {
            // Ignore errors for candidates that arrive after connection is established
            if (error.name !== 'InvalidStateError') {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }, []);

    // Toggle audio track
    // @returns {boolean} - New audio state
    const toggleAudio = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                safeSetState(setIsAudioEnabled, audioTrack.enabled);
                return audioTrack.enabled;
            }
        }
        return isAudioEnabled;
    }, [isAudioEnabled, safeSetState]);

    // Toggle video track
    // @returns {boolean} - New video state
    const toggleVideo = useCallback(() => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                safeSetState(setIsVideoEnabled, videoTrack.enabled);
                return videoTrack.enabled;
            }
        }
        return isVideoEnabled;
    }, [isVideoEnabled, safeSetState]);

    // CLEANUP: Comprehensive cleanup of all WebRTC resources
    //
    // WHY CLEANUP IS CRITICAL:
    // 1. Camera/Mic: Without stopping tracks, the hardware stays active
    //    (camera light stays on, mic keeps recording)
    // 2. Memory: MediaStreams and RTCPeerConnection hold references
    //    that prevent garbage collection
    // 3. Network: Open connections consume bandwidth and can cause issues
    //    with subsequent calls
    // 4. State: Stale state can cause bugs when starting new calls
    const cleanup = useCallback(() => {
        console.log('🧹 Starting WebRTC cleanup...');

        // STEP 1: Stop all local media tracks
        // This releases the camera and microphone hardware
        if (localStreamRef.current) {
            stopMediaTracks(localStreamRef.current);
            localStreamRef.current = null;
        }

        // STEP 2: Stop remote stream tracks (if any)
        // Remote streams should also be cleaned up
        if (remoteStreamRef.current) {
            stopMediaTracks(remoteStreamRef.current);
            remoteStreamRef.current = null;
        }

        // STEP 3: Close the peer connection
        // This terminates the WebRTC connection and releases network resources
        closePeerConnection();

        // STEP 4: Clear pending ICE candidates
        pendingIceCandidatesRef.current = [];

        // STEP 5: Reset all state to initial values
        // This ensures a clean slate for the next call
        safeSetState(setLocalStream, null);
        safeSetState(setRemoteStream, null);
        safeSetState(setIsAudioEnabled, true);
        safeSetState(setIsVideoEnabled, true);
        safeSetState(setConnectionState, 'new');

        console.log('✅ WebRTC cleanup complete - ready for new call');
    }, [stopMediaTracks, closePeerConnection, safeSetState]);

    // CLEANUP: Handle peer disconnection gracefully
    // Called when remote peer leaves unexpectedly
    const handlePeerDisconnect = useCallback(() => {
        console.log('👋 Handling peer disconnect...');

        // Clear remote stream but keep local stream active
        if (remoteStreamRef.current) {
            remoteStreamRef.current = null;
        }
        safeSetState(setRemoteStream, null);

        // Reset connection state
        safeSetState(setConnectionState, 'disconnected');

        console.log('✅ Peer disconnect handled');
    }, [safeSetState]);

    // Set callback for ICE candidates
    // This allows CallRoom to emit candidates to socket
    const setOnIceCandidate = useCallback((callback) => {
        onIceCandidateRef.current = callback;
    }, []);

    return {
        localStream,
        remoteStream,
        isAudioEnabled,
        isVideoEnabled,
        connectionState,
        peerConnection: peerConnectionRef.current,
        initializeMedia,
        createPeerConnection,
        createOffer,
        handleOffer,
        handleAnswer,
        handleIceCandidate,
        toggleAudio,
        toggleVideo,
        cleanup,
        handlePeerDisconnect,
        setOnIceCandidate,
    };
};

export default useWebRTC;
