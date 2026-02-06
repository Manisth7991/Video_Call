// Register Page
// Handles new user registration

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

const Register = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [formError, setFormError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, error, clearError, actionLoading } = useAuth();
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

        // Validation
        if (!formData.name || !formData.email || !formData.password) {
            setFormError('Please fill in all required fields');
            return;
        }

        if (formData.password.length < 6) {
            setFormError('Password must be at least 6 characters');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setFormError('Passwords do not match');
            return;
        }

        // Prevent double submission
        if (actionLoading || isSubmitting) {
            return;
        }

        setIsSubmitting(true);

        const result = await register({
            name: formData.name,
            email: formData.email,
            password: formData.password,
        });

        if (result.success) {
            navigate('/dashboard');
        } else {
            setFormError(result.message);
        }

        setIsSubmitting(false);
    };

    return (
        <div className="auth-container">
            {/* Card contains both header and form */}
            <div className="auth-card">
                {/* Header inside card */}
                <div className="auth-header">
                    <button
                        type="button"
                        className="auth-header-back"
                        onClick={() => navigate('/login')}
                        aria-label="Go back"
                    >
                        ←
                    </button>
                    <h1>Sign Up</h1>
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
                            <label htmlFor="name">Username</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                autoComplete="username"
                                disabled={isSubmitting}
                            />
                        </div>

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
                                autoComplete="new-password"
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                autoComplete="new-password"
                                disabled={isSubmitting}
                            />
                        </div>

                        <button
                            type="submit"
                            className="auth-button"
                            disabled={isSubmitting || actionLoading}
                        >
                            {isSubmitting || actionLoading ? 'Creating account...' : 'Sign Up'}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="auth-footer">
                        <p>
                            Already have an account?{' '}
                            <Link to="/login">Sign In</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;
