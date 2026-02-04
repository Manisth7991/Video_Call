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

// ========== ADAPTIVE BITRATE CONFIGURATION ==========
// Bitrate targets (in bps) for different network conditions
const BITRATE_CONFIG = {
    START: 3_500_000,      // Start at ~3.5 Mbps
    MAX_GOOD: 5_000_000,   // Max for good network: 5 Mbps
    MEDIUM: 2_000_000,     // Medium network: 2 Mbps
    POOR: 800_000,         // Poor network: 800 kbps
    TURN_CAP: 1_500_000,   // Cap when using TURN relay: 1.5 Mbps
};

// Network quality thresholds
const NETWORK_THRESHOLDS = {
    GOOD_RTT: 100,         // RTT < 100ms = good
    MEDIUM_RTT: 250,       // RTT < 250ms = medium
    GOOD_PACKET_LOSS: 0.02,    // < 2% packet loss = good
    MEDIUM_PACKET_LOSS: 0.05,  // < 5% packet loss = medium
};

// Preferred video codecs in order
const PREFERRED_CODECS = ['video/VP9', 'video/VP8', 'video/H264'];

// STUN servers help discover public IP addresses
// TURN servers relay traffic when direct peer connection fails
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        {
            urls: 'turn:global.relay.metered.ca:80',
            username: 'c4377e702032cc59c45e1205',
            credential: 'BFsu8ViH2WVzegL3',
        },
        {
            urls: 'turn:global.relay.metered.ca:80?transport=tcp',
            username: 'c4377e702032cc59c45e1205',
            credential: 'BFsu8ViH2WVzegL3',
        },
        {
            urls: 'turn:global.relay.metered.ca:443',
            username: 'c4377e702032cc59c45e1205',
            credential: 'BFsu8ViH2WVzegL3',
        },
        {
            urls: 'turns:global.relay.metered.ca:443?transport=tcp',
            username: 'c4377e702032cc59c45e1205',
            credential: 'BFsu8ViH2WVzegL3',
        },
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
    // Ref for adaptive bitrate interval
    const bitrateIntervalRef = useRef(null);
    // Track if we're using TURN relay
    const isUsingTurnRef = useRef(false);
    // Current bitrate for logging
    const currentBitrateRef = useRef(BITRATE_CONFIG.START);

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
            });
        }
    }, []);

    // CLEANUP: Close and cleanup peer connection
    // This releases network resources and ICE candidates
    const closePeerConnection = useCallback(() => {
        // Stop adaptive bitrate monitoring
        if (bitrateIntervalRef.current) {
            clearInterval(bitrateIntervalRef.current);
            bitrateIntervalRef.current = null;
        }

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
            }

            peerConnectionRef.current = null;
        }

        // Reset TURN detection
        isUsingTurnRef.current = false;
    }, []);

    // Initialize media devices (camera + microphone)
    // Uses high-quality constraints with 1080p ideal, fallback to lower resolutions
    const initializeMedia = useCallback(async () => {
        try {
            // Request camera and microphone access with high-quality constraints
            // Using IDEAL constraints allows browser to negotiate best available
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1920, min: 640 },   // 1080p ideal, 480p minimum
                    height: { ideal: 1080, min: 480 },
                    frameRate: { ideal: 30, min: 15 },  // 30fps ideal
                    aspectRatio: { ideal: 16 / 9 },
                    facingMode: 'user', // Front camera on mobile
                    // Disable auto zoom/crop features that focus on face
                    resizeMode: 'none',
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
        });

        // Handle incoming remote tracks
        // This fires when the remote peer adds their media tracks
        pc.ontrack = (event) => {
            const [stream] = event.streams;
            remoteStreamRef.current = stream;
            safeSetState(setRemoteStream, stream);
        };

        // Handle ICE candidates
        // ICE candidates are used to establish the connection path
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                // Call the callback if set (will emit to socket)
                if (onIceCandidateRef.current) {
                    onIceCandidateRef.current(event.candidate);
                }
            }
        };

        // Monitor connection state changes
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            safeSetState(setConnectionState, state);

            // Handle disconnection states
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                // Connection lost or closed
            }
        };

        // Monitor ICE connection state and detect TURN usage
        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;

            // When connected, check if using TURN relay and start adaptive bitrate
            if (state === 'connected' || state === 'completed') {
                detectTurnUsage(pc);
                startAdaptiveBitrate(pc);
            }
        };

        // Set codec preferences (VP9 > VP8 > H.264)
        setCodecPreferences(pc);

        return pc;
    }, [closePeerConnection, safeSetState]);

    // Detect if connection is using TURN relay (and cap bitrate accordingly)
    const detectTurnUsage = useCallback(async (pc) => {
        try {
            const stats = await pc.getStats();
            stats.forEach((report) => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    // Check if local or remote candidate is relay type
                    stats.forEach((candidateReport) => {
                        if (candidateReport.id === report.localCandidateId ||
                            candidateReport.id === report.remoteCandidateId) {
                            if (candidateReport.candidateType === 'relay') {
                                isUsingTurnRef.current = true;
                            }
                        }
                    });
                }
            });
        } catch (error) {
            console.error('[WebRTC] Error detecting TURN usage:', error);
        }
    }, []);

    // Set preferred video codecs (VP9 > VP8 > H.264)
    const setCodecPreferences = useCallback((pc) => {
        const transceivers = pc.getTransceivers();
        transceivers.forEach((transceiver) => {
            if (transceiver.sender && transceiver.sender.track?.kind === 'video') {
                const capabilities = RTCRtpSender.getCapabilities?.('video');
                if (capabilities) {
                    const codecs = capabilities.codecs;
                    const sortedCodecs = [];

                    // Add codecs in preferred order
                    for (const preferred of PREFERRED_CODECS) {
                        const matching = codecs.filter(c => c.mimeType === preferred);
                        sortedCodecs.push(...matching);
                    }

                    // Add remaining codecs
                    const remaining = codecs.filter(c => !PREFERRED_CODECS.includes(c.mimeType));
                    sortedCodecs.push(...remaining);

                    try {
                        transceiver.setCodecPreferences(sortedCodecs);
                    } catch (e) {
                        // setCodecPreferences may not be supported in all browsers
                    }
                }
            }
        });
    }, []);

    // Adaptive bitrate control based on network conditions
    const startAdaptiveBitrate = useCallback((pc) => {
        // Clear any existing interval
        if (bitrateIntervalRef.current) {
            clearInterval(bitrateIntervalRef.current);
        }

        // Set initial bitrate
        applyBitrate(pc, BITRATE_CONFIG.START);

        // Monitor network and adjust bitrate every 3 seconds
        bitrateIntervalRef.current = setInterval(async () => {
            try {
                const stats = await pc.getStats();
                const networkQuality = analyzeNetworkQuality(stats);
                const targetBitrate = calculateTargetBitrate(networkQuality);

                // Only log and apply if bitrate changed significantly (>10%)
                const change = Math.abs(targetBitrate - currentBitrateRef.current) / currentBitrateRef.current;
                if (change > 0.1) {
                    applyBitrate(pc, targetBitrate);
                }
            } catch (error) {
                // Connection might be closing, ignore errors
            }
        }, 3000);
    }, []);

    // Analyze network quality from WebRTC stats
    const analyzeNetworkQuality = useCallback((stats) => {
        let rtt = 0;
        let packetsLost = 0;
        let packetsSent = 0;

        stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                rtt = report.currentRoundTripTime * 1000 || 0; // Convert to ms
            }
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
                packetsSent = report.packetsSent || 0;
            }
            if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
                packetsLost = report.packetsLost || 0;
            }
        });

        const packetLossRate = packetsSent > 0 ? packetsLost / packetsSent : 0;

        return { rtt, packetLossRate };
    }, []);

    // Calculate target bitrate based on network quality
    const calculateTargetBitrate = useCallback((networkQuality) => {
        const { rtt, packetLossRate } = networkQuality;

        let quality = 'good';
        if (rtt > NETWORK_THRESHOLDS.MEDIUM_RTT || packetLossRate > NETWORK_THRESHOLDS.MEDIUM_PACKET_LOSS) {
            quality = 'poor';
        } else if (rtt > NETWORK_THRESHOLDS.GOOD_RTT || packetLossRate > NETWORK_THRESHOLDS.GOOD_PACKET_LOSS) {
            quality = 'medium';
        }

        let targetBitrate;
        switch (quality) {
            case 'good':
                targetBitrate = BITRATE_CONFIG.MAX_GOOD;
                break;
            case 'medium':
                targetBitrate = BITRATE_CONFIG.MEDIUM;
                break;
            case 'poor':
            default:
                targetBitrate = BITRATE_CONFIG.POOR;
                break;
        }

        // Cap bitrate if using TURN relay
        if (isUsingTurnRef.current && targetBitrate > BITRATE_CONFIG.TURN_CAP) {
            targetBitrate = BITRATE_CONFIG.TURN_CAP;
        }

        return targetBitrate;
    }, []);

    // Apply bitrate to video sender (without disabling congestion control)
    const applyBitrate = useCallback(async (pc, targetBitrate) => {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');

        if (!videoSender) return;

        try {
            const params = videoSender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
            }

            // Set maxBitrate as a soft cap - WebRTC congestion control still active
            params.encodings[0].maxBitrate = targetBitrate;

            // For poor network, also reduce framerate
            if (targetBitrate <= BITRATE_CONFIG.POOR) {
                params.encodings[0].maxFramerate = 15;
            } else {
                // Remove framerate cap for better quality
                delete params.encodings[0].maxFramerate;
            }

            await videoSender.setParameters(params);
            currentBitrateRef.current = targetBitrate;
        } catch (error) {
            // Bitrate adjustment failed - WebRTC will use default congestion control
        }
    }, []);

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
            pendingIceCandidatesRef.current = [];

            for (const candidate of candidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
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
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }

            // Buffer candidate if remote description is not set yet
            if (!pc.remoteDescription) {
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }

            // Remote description is set, add candidate immediately
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            // Ignore errors for candidates that arrive after connection is established
            if (error.name !== 'InvalidStateError') {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }, []);

    // Toggle audio track
    // IMPORTANT: Only toggles track.enabled, never reattaches streams
    // This prevents any possibility of local audio playing back to user
    // @returns {boolean} - New audio state
    const toggleAudio = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                // Toggle enabled state - track stays in stream, just muted/unmuted
                audioTrack.enabled = !audioTrack.enabled;
                const newState = audioTrack.enabled;
                safeSetState(setIsAudioEnabled, newState);
                return newState;
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

        // STEP 4.5: Stop adaptive bitrate monitoring
        if (bitrateIntervalRef.current) {
            clearInterval(bitrateIntervalRef.current);
            bitrateIntervalRef.current = null;
        }
        isUsingTurnRef.current = false;
        currentBitrateRef.current = BITRATE_CONFIG.START;

        // STEP 5: Reset all state to initial values
        // This ensures a clean slate for the next call
        safeSetState(setLocalStream, null);
        safeSetState(setRemoteStream, null);
        safeSetState(setIsAudioEnabled, true);
        safeSetState(setIsVideoEnabled, true);
        safeSetState(setConnectionState, 'new');
    }, [stopMediaTracks, closePeerConnection, safeSetState]);

    // CLEANUP: Handle peer disconnection gracefully
    // Called when remote peer leaves unexpectedly
    const handlePeerDisconnect = useCallback(() => {
        // Clear remote stream but keep local stream active
        if (remoteStreamRef.current) {
            remoteStreamRef.current = null;
        }
        safeSetState(setRemoteStream, null);

        // Reset connection state
        safeSetState(setConnectionState, 'disconnected');
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
