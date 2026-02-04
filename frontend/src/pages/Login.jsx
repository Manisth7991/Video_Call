// Login Page
// Handles user authentication with email and password

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

const Login = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [formError, setFormError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { login, error, clearError, loading } = useAuth();
    const navigate = useNavigate();

    // Handle input changes
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        setFormError('');
        clearError();
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');

        // Basic validation
        if (!formData.email || !formData.password) {
            setFormError('Please fill in all fields');
            return;
        }

        // Prevent submission if auth is still loading (e.g., checkAuth running)
        if (loading) {
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await login(formData);

            if (result && result.success) {
                navigate('/dashboard');
            } else {
                setFormError(result?.message || 'Login failed. Please try again.');
            }
        } catch (err) {
            setFormError('An unexpected error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-container">
            {/* Card contains both header and form */}
            <div className="auth-card">
                {/* Header inside card */}
                <div className="auth-header">
                    <h1>Sign In</h1>
                </div>

                {/* Form Body */}
                <div className="auth-form-body">
                    <form onSubmit={handleSubmit} className="auth-form">
                        {(formError || error) && (
                            <div className="error-message">
                                {formError || error}
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="email">E-mail</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                autoComplete="email"
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                                disabled={isSubmitting}
                            />
                        </div>

                        <button
                            type="submit"
                            className="auth-button"
                            disabled={isSubmitting || loading}
                        >
                            {isSubmitting ? 'Signing in...' : loading ? 'Please wait...' : 'Sign In'}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="auth-footer">
                        <p>
                            Don't have an account?{' '}
                            <Link to="/register">Sign Up</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
