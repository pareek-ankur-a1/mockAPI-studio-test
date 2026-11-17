import crypto from 'crypto';

const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

export function generateOTP() {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

//we use sha256 to hash OTPs instead of slower bcrypt because it is faster
//OTPs expire in 10 minutes and limited to 5 tries so a brute force attack can't pass.
export function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export function otpExpiresAt() {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}

export function verifyOTP(user, submitted) {
  if (!user.otpHash || !user.otpExpiresAt) return 'missing';
  if (new Date() > user.otpExpiresAt) return 'expired';
  if (user.otpAttempts >= MAX_OTP_ATTEMPTS) return 'locked';

  const submittedHash = hashOTP(submitted.toString().trim());
  if (submittedHash !== user.otpHash) return 'invalid';

  return 'ok';
}

export { OTP_TTL_MINUTES, MAX_OTP_ATTEMPTS };