/**
 * @file auth.js  (router)
 * @description Authentication routes.
 *
 *   Public  (no JWT):
 *     POST /api/auth/register      → create account, issue JWT, send OTP email
 *     POST /api/auth/login         → verify credentials, issue JWT
 *
 *   Protected (JWT required via verifyJWT):
 *     GET  /api/auth/me            → return live user profile
 *     POST /api/auth/verify-email  → submit OTP, get new JWT (isVerified: true)
 *     POST /api/auth/resend-otp    → regenerate OTP and resend email
 *
 * Rate limiting on OTP routes:
 *   resend-otp   → 3 requests per 15 minutes per IP (prevents OTP spam)
 *   verify-email → 10 requests per 15 minutes per IP (backed by attempt counter in DB)
 */

import { Router } from 'express';
import { loginLimiter, registerLimiter, otpVerifyLimiter, otpResendLimiter } from '../middleware/rateLimiter.js';
import { register, login, getMe, verifyEmail, resendOtp } from '../controllers/authController.js';
import { verifyJWT } from '../middleware/auth.js';

const authRouter = Router();

// ── Rate limiters specific to OTP endpoints ───────────────────────────────────

// ── Routes ────────────────────────────────────────────────────────────────────

// Public
authRouter.post('/register', registerLimiter, register);
authRouter.post('/login', loginLimiter, login);

// Protected — require valid JWT
authRouter.get('/me', verifyJWT, getMe);
authRouter.post('/verify-email', verifyJWT, otpVerifyLimiter, verifyEmail);
authRouter.post('/resend-otp', verifyJWT, otpResendLimiter, resendOtp);

export default authRouter;
