
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: [2, 'Name must be at least 2 characters'],
            maxlength: [50, 'Name cannot exceed 50 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                'Please enter a valid email',
            ],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
            select: false, // Don't include password in queries by default
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt fields
    }
);


// Pre-save middleware to hash password before storing
// Only hashes if password is modified (not on every save)

userSchema.pre('save', async function (next) {
    // Skip if password wasn't modified
    if (!this.isModified('password')) {
        return next();
    }

    try {
        // Generate salt with 12 rounds (recommended for security)
        const salt = await bcrypt.genSalt(12);
        // Hash the password
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});


// Instance method to compare passwords
// @param {string} candidatePassword - Password to compare
// @returns {Promise<boolean>} - True if passwords match

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
