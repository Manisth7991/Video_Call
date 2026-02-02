// Dashboard Page
// Main page after login - allows creating/joining video call rooms

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import './Dashboard.css';

const Dashboard = () => {
    const [roomId, setRoomId] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [error, setError] = useState('');

    const { user, logout } = useAuth();
    const navigate = useNavigate();

    // Create a new video call room
    const handleCreateRoom = async () => {
        try {
            setError('');
            setIsCreating(true);

            const response = await api.post('/call/create-room');

            if (response.data.success) {
                // Navigate to the call room with the new room ID
                navigate(`/call/${response.data.roomId}`);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create room');
        } finally {
            setIsCreating(false);
        }
    };

    // Join an existing room
    const handleJoinRoom = async (e) => {
        e.preventDefault();

        if (!roomId.trim()) {
            setError('Please enter a room ID');
            return;
        }

        try {
            setError('');
            setIsJoining(true);

            // Check if room exists
            const response = await api.post('/call/join-room', { roomId: roomId.trim() });

            if (response.data.success) {
                navigate(`/call/${roomId.trim()}`);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to join room');
        } finally {
            setIsJoining(false);
        }
    };

    // Handle logout
    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <div className="dashboard-container">
            {/* Header */}
            <header className="dashboard-header">
                <h1>📹 Video Call</h1>
                <div className="user-info">
                    <span>Welcome, {user?.name}</span>
                    <button onClick={handleLogout} className="logout-button">
                        Logout
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="dashboard-main">
                <div className="dashboard-card">
                    <h2>Start a Video Call</h2>
                    <p>Create a new room or join an existing one</p>

                    {error && <div className="error-message">{error}</div>}

                    {/* Create Room Section */}
                    <div className="action-section">
                        <button
                            onClick={handleCreateRoom}
                            disabled={isCreating}
                            className="primary-button"
                        >
                            {isCreating ? 'Creating...' : '🎥 Create New Room'}
                        </button>
                        <p className="action-description">
                            Create a new room and share the room ID with others
                        </p>
                    </div>

                    <div className="divider">
                        <span>OR</span>
                    </div>

                    {/* Join Room Section */}
                    <form onSubmit={handleJoinRoom} className="join-form">
                        <div className="form-group">
                            <label htmlFor="roomId">Room ID</label>
                            <input
                                type="text"
                                id="roomId"
                                value={roomId}
                                onChange={(e) => {
                                    setRoomId(e.target.value);
                                    setError('');
                                }}
                                placeholder="Enter room ID to join"
                                disabled={isJoining}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isJoining || !roomId.trim()}
                            className="secondary-button"
                        >
                            {isJoining ? 'Joining...' : '🔗 Join Room'}
                        </button>
                    </form>
                </div>

                {/* Quick Guide */}
                <div className="quick-guide">
                    <h3>How it works</h3>
                    <ol>
                        <li>Create a new room or enter an existing room ID</li>
                        <li>Share the room ID with the person you want to call</li>
                        <li>Both users need to allow camera and microphone access</li>
                        <li>Enjoy your video call!</li>
                    </ol>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
