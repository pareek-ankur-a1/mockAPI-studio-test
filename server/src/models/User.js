/**
 * @file User.js
 * @description Mongoose model for authenticated users.
 *
 * OTP fields (all `select: false` — never accidentally exposed in API responses):
 *   otpHash       → SHA-256 hash of the 6-digit OTP (never store plaintext OTPs)
 *   otpExpiresAt  → When the OTP becomes invalid (10 minutes from issue)
 *   otpAttempts   → How many wrong guesses have been made (max 5 before lockout)
 */

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },

    /**
     * bcrypt hash — select: false so it's never sent to clients by accident.
     */
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },

    /**
     * Whether this user has verified their email address via OTP.
     * Unverified users can log in but cannot access dashboard routes.
     */
    isVerified: {
      type: Boolean,
      default: false,
    },

    // ── OTP fields — hidden from all queries unless explicitly selected ────────

    /**
     * SHA-256 hash of the most recently issued 6-digit OTP.
     * We hash the OTP before storage so even if the DB is breached,
     * raw OTPs are not exposed (they're short-lived, but defence-in-depth matters).
     */
    otpHash: {
      type: String,
      select: false,
    },

    /**
     * Expiry timestamp — OTP is invalid after this point.
     * Default TTL is 10 minutes (set in otpHelper.js).
     */
    otpExpiresAt: {
      type: Date,
      select: false,
    },

    /**
     * Count of incorrect OTP submissions for the current OTP.
     * Reset to 0 each time a new OTP is issued.
     * After 5 failed attempts, the OTP is invalidated (requires resend).
     */
    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

const User = mongoose.model('User', userSchema);
export default User;
