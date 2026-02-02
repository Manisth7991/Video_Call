// VideoPlayer Component
// Renders a video stream with labels

import { useEffect, useRef } from 'react';
import './VideoPlayer.css';

const VideoPlayer = ({ stream, muted = false, label = '', isLocal = false }) => {
    const videoRef = useRef(null);

    // Set video source when stream changes
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className={`video-player ${isLocal ? 'local' : 'remote'}`}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={muted}
                className="video-element"
            />
            {label && (
                <div className="video-label">
                    {label}
                </div>
            )}
            {!stream && (
                <div className="no-video">
                    <span>📷</span>
                    <p>No video</p>
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
