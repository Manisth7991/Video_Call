// Controls Component
// Video call control buttons (audio, video, leave)

import './Controls.css';

const Controls = ({
    isAudioEnabled,
    isVideoEnabled,
    onToggleAudio,
    onToggleVideo,
    onLeaveCall,
}) => {
    return (
        <div className="controls-container">
            <div className="controls">
                {/* Toggle Audio Button */}
                <button
                    onClick={onToggleAudio}
                    className={`control-button ${isAudioEnabled ? 'active' : 'inactive'}`}
                    title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                >
                    {isAudioEnabled ? '🎤' : '🔇'}
                    <span className="control-label">
                        {isAudioEnabled ? 'Mute' : 'Unmute'}
                    </span>
                </button>

                {/* Toggle Video Button */}
                <button
                    onClick={onToggleVideo}
                    className={`control-button ${isVideoEnabled ? 'active' : 'inactive'}`}
                    title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                    {isVideoEnabled ? '📹' : '📷'}
                    <span className="control-label">
                        {isVideoEnabled ? 'Stop Video' : 'Start Video'}
                    </span>
                </button>

                {/* Leave Call Button */}
                <button
                    onClick={onLeaveCall}
                    className="control-button leave"
                    title="Leave call"
                >
                    📞
                    <span className="control-label">Leave</span>
                </button>
            </div>
        </div>
    );
};

export default Controls;
