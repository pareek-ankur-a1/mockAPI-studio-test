/**
 * @file authController.js
 * @description Handles registration, login, email OTP verification, and identity.
 *
 * Updated auth flow:
 *
 *   POST /api/auth/register
 *     → hash password → save user (isVerified: false)
 *     → generate OTP → hash + store OTP on user → send email
 *     → return JWT (isVerified: false in payload) + user
 *     → frontend redirects to /verify-email
 *
 *   POST /api/auth/verify-email  (JWT required)
 *     → verify OTP hash + expiry + attempts
 *     → on success: clear OTP fields, set isVerified: true, issue NEW JWT
 *     → new JWT has isVerified: true → frontend redirects to /
 *
 *   POST /api/auth/resend-otp  (JWT required)
 *     → generate fresh OTP → hash + store → send email again
 *     → rate-limited: 1 resend per 60 seconds (enforced by rateLimiter)
 *
 *   POST /api/auth/login
 *     → verify password → return JWT (includes isVerified from DB)
 *
 *   GET  /api/auth/me  (JWT required)
 *     → return live user profile from DB
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { generateOTP, hashOTP, otpExpiresAt, verifyOTP } from '../utils/otpHelper.js';
import { sendOtpEmail } from '../utils/emailService.js';

const SALT_ROUNDS = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * Builds the safe user object returned to clients.
 * Always includes `isVerified` so the frontend can redirect appropriately.
 */
function safeUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  };
}

/**
 * Issues a token that embeds the user's current isVerified status.
 * Call this after verification so the new token reflects isVerified: true.
 */
function issueToken(user) {
  return signToken({
    userId: user._id,
    email: user.email,
    name: user.name,
    isVerified: user.isVerified,
  });
}

// ── POST /api/auth/register ───────────────────────────────────────────────────

export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are all required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user — isVerified defaults to false (see User model)
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
    });

    // ── Generate and store OTP ──────────────────────────────────────────────
    const otp = generateOTP();
    user.otpHash = hashOTP(otp);
    user.otpExpiresAt = otpExpiresAt();
    user.otpAttempts = 0;
    await user.save();

    // ── Send verification email ─────────────────────────────────────────────
    // Preserve the new account and token on delivery failure so users can resend.
    let emailSent = true;
    try {
      await sendOtpEmail(user.email, user.name, otp);
    } catch (err) {
      emailSent = false;
      console.error('⚠️  OTP email send failed:', err.message);
    }

    // ── Issue JWT (isVerified: false) ───────────────────────────────────────
    // The frontend uses `isVerified` from the user object (or JWT payload)
    // to decide whether to redirect to /verify-email or /.
    const token = issueToken(user);

    res.status(201).json({
      success: true,
      message: emailSent
        ? `Account created! A 6-digit verification code has been sent to ${user.email}.`
        : 'Account created, but the verification email could not be sent. Please try resending the code.',
      emailSent,
      token,
      user: safeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/auth/verify-email ───────────────────────────────────────────────

export async function verifyEmail(req, res, next) {
  try {
    const { otp } = req.body;

    if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
      return res.status(400).json({ success: false, message: 'A 6-digit OTP is required.' });
    }

    // Fetch user WITH the hidden OTP fields
    const user = await User.findById(req.user.userId)
      .select('+otpHash +otpExpiresAt +otpAttempts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.isVerified) {
      return res.status(200).json({ success: true, message: 'Email is already verified.' });
    }

    // ── Run OTP verification logic ──────────────────────────────────────────
    const result = verifyOTP(user, otp.trim());

    if (result === 'missing') {
      return res.status(400).json({
        success: false,
        message: 'No verification code found. Please request a new one.',
      });
    }

    if (result === 'expired') {
      return res.status(400).json({
        success: false,
        code: 'OTP_EXPIRED',
        message: 'This code has expired. Please request a new one.',
      });
    }

    if (result === 'locked') {
      return res.status(429).json({
        success: false,
        code: 'OTP_LOCKED',
        message: 'Too many wrong attempts. Please request a new verification code.',
      });
    }

    if (result === 'invalid') {
      // Increment attempt counter before returning error
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();

      const attemptsLeft = 5 - user.otpAttempts;
      return res.status(400).json({
        success: false,
        code: 'OTP_INVALID',
        message: attemptsLeft > 0
          ? `Incorrect code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`
          : 'Incorrect code. No attempts remaining — please request a new code.',
      });
    }

    // ── OTP is correct ──────────────────────────────────────────────────────
    // Clear OTP fields and mark account as verified atomically
    user.isVerified = true;
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    await user.save();

    // Issue a FRESH JWT with isVerified: true in the payload
    const token = issueToken(user);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! Welcome to MockAPI Studio.',
      token,                   // client should replace the old token with this one
      user: safeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/auth/resend-otp ─────────────────────────────────────────────────

export async function resendOtp(req, res, next) {
  try {
    const user = await User.findById(req.user.userId)
      .select('+otpHash +otpExpiresAt +otpAttempts');

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'This email is already verified.' });
    }

    // Generate a fresh OTP — resets the attempt counter too
    const otp = generateOTP();
    user.otpHash = hashOTP(otp);
    user.otpExpiresAt = otpExpiresAt();
    user.otpAttempts = 0;
    await user.save();

    await sendOtpEmail(user.email, user.name, otp);

    res.status(200).json({
      success: true,
      message: `A new verification code has been sent to ${user.email}.`,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Token includes isVerified so frontend can redirect unverified users
    const token = issueToken(user);

    res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: safeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.status(200).json({ success: true, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}
