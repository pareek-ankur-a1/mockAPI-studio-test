/**
 * @file otpHelper.js
 * @description Utilities for generating, hashing, and comparing OTPs.
 *
 * Why SHA-256 instead of bcrypt for OTPs?
 * ────────────────────────────────────────
 * bcrypt is deliberately slow (to resist brute-force of long-lived passwords).
 * OTPs are short-lived (10 minutes) and 6 digits — not long-lived secrets.
 * SHA-256 is fast enough for our purpose AND safe here because:
 *   - The OTP search space is only 900,000 values (100000–999999)
 *   - We add rate limiting + max-attempt lockout (5 tries max)
 *   - The OTP expires in 10 minutes regardless
 *
 * A brute-force attacker would need to make 450,000 average requests in under
 * 10 minutes against a rate-limited endpoint — effectively impossible.
 */

import crypto from 'crypto';

const OTP_TTL_MINUTES = 10; // OTP expires after this many minutes
const MAX_OTP_ATTEMPTS = 5;  // Lock out after this many wrong guesses

/**
 * Generates a cryptographically random 6-digit OTP string.
 * `crypto.randomInt` is uniformly distributed — no modulo bias.
 *
 * @returns {string}  e.g. "847293"
 */
export function generateOTP() {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

/**
 * Hashes an OTP using SHA-256.
 * The same OTP always produces the same hash (deterministic) so we can verify
 * the user's input without storing the plaintext.
 *
 * @param {string} otp  The plaintext OTP to hash
 * @returns {string}    Hex-encoded SHA-256 digest
 */
export function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Returns the Date at which a freshly-issued OTP will expire.
 *
 * @returns {Date}
 */
export function otpExpiresAt() {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}

/**
 * Verifies a user-submitted OTP against the stored hash.
 *
 * Also performs structural checks that must all pass:
 *   1. The user has a stored OTP (hasn't already verified)
 *   2. The OTP hasn't expired
 *   3. The attempt count hasn't exceeded the maximum
 *   4. The submitted OTP's hash matches the stored hash
 *
 * Returns one of these result codes:
 *   'ok'       → OTP is correct
 *   'expired'  → OTP TTL has passed (user must request a new one)
 *   'locked'   → Too many failed attempts (user must request a new one)
 *   'invalid'  → Hash doesn't match (wrong OTP)
 *   'missing'  → No OTP record exists for this user
 *
 * @param {object} user     Mongoose User document (must have been selected with OTP fields)
 * @param {string} submitted The raw OTP string the user typed in
 * @returns {'ok'|'expired'|'locked'|'invalid'|'missing'}
 */
export function verifyOTP(user, submitted) {
  if (!user.otpHash || !user.otpExpiresAt) return 'missing';
  if (new Date() > user.otpExpiresAt) return 'expired';
  if (user.otpAttempts >= MAX_OTP_ATTEMPTS) return 'locked';

  const submittedHash = hashOTP(submitted.toString().trim());
  if (submittedHash !== user.otpHash) return 'invalid';

  return 'ok';
}

export { OTP_TTL_MINUTES, MAX_OTP_ATTEMPTS };
