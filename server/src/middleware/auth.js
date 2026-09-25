/**
 * @file auth.js  (middleware)
 * @description JWT verification middleware — protects internal dashboard routes.
 *
 * Usage in routes:
 *   import { verifyJWT } from '../middleware/auth.js';
 *   router.get('/projects', verifyJWT, listProjects);
 *
 * What it does:
 *   1. Reads the Authorization header: "Bearer <token>"
 *   2. Verifies the token signature + expiry with JWT_SECRET
 *   3. Attaches the decoded payload to `req.user`
 *   4. Calls next() — the downstream controller can safely use req.user._id
 *
 * On failure → 401 Unauthorized (missing/invalid token) or 403 Forbidden (expired)
 *
 * Why NOT use cookies?
 *   Cookies work well for same-origin apps. We chose localStorage + Bearer token
 *   because the mock engine is already multi-origin by design (different ports).
 *   Consistent "Authorization: Bearer <token>" headers work everywhere.
 */

import jwt from 'jsonwebtoken';

/**
 * Express middleware that verifies a JWT from the Authorization header.
 *
 * On success: attaches decoded payload to `req.user` and calls next()
 * On failure: returns 401 or 403 JSON response
 */
export function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  // Authorization header must exist and start with "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided. Please log in.',
    });
  }

  const token = authHeader.split(' ')[1]; // Extract the token after "Bearer "

  try {
    /**
     * jwt.verify() does two things:
     *  1. Verifies the signature matches (proves the token was issued by us)
     *  2. Checks the `exp` claim — throws TokenExpiredError if expired
     */
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded payload to req so downstream controllers can use it:
    //   req.user.userId  → MongoDB ObjectId string of the logged-in user
    //   req.user.email   → user's email
    //   req.user.name    → user's display name
    req.user = decoded;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }

    // JsonWebTokenError, NotBeforeError, or any other verification failure
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
    });
  }
}

/**
 * requireVerified — must run AFTER verifyJWT.
 *
 * Blocks unverified users from accessing the internal dashboard API.
 * `isVerified` is embedded in the JWT payload so no extra DB call is needed.
 */
export function requireVerified(req, res, next) {
  if (!req.user?.isVerified) {
    return res.status(403).json({
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email address before accessing the dashboard.',
    });
  }
  next();
}
