import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../api/config.js';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/shared/Toast.jsx';
import Button from '../components/shared/Button.jsx';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60; // seconds before resend button re-enables

export default function VerifyEmailPage() {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds until resend re-enables
  const inputRefs = useRef([]);
  const { user, saveAuth, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Start cooldown on mount (OTP was just sent during register)
  useEffect(() => {
    startCooldown();
  }, []);

  // Redirect to home if already verified
  useEffect(() => {
    if (user?.isVerified) navigate('/', { replace: true });
  }, [user]);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  // ── Digit input handling ──────────────────────────────────────────────────

  function handleDigitChange(index, value) {
    // Allow only single digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError('');

    // Auto-advance to next box
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    // Focus the last filled box
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  // ── Submit OTP ────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length < OTP_LENGTH) {
      setError('Please enter all 6 digits.'); return;
    }

    setLoading(true);
    setError('');
    try {
      const stored = localStorage.getItem('mockapi_token');
      const res = await fetch(apiUrl('/api/auth/verify-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored}` },
        body: JSON.stringify({ otp }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.message || 'Verification failed.');
        // Clear inputs on expired/locked so user knows to resend
        if (json.code === 'OTP_EXPIRED' || json.code === 'OTP_LOCKED') {
          setDigits(Array(OTP_LENGTH).fill(''));
          inputRefs.current[0]?.focus();
        }
        return;
      }

      // Replace token with the newly issued one (isVerified: true)
      saveAuth(json.token, json.user);
      toast.success('Email verified! Welcome to MockAPI Studio 🎉');
      navigate('/', { replace: true });
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  // ── Resend OTP ────────────────────────────────────────────────────────────

  async function handleResend() {
    if (cooldown > 0) return;
    setResending(true);
    setError('');
    try {
      const stored = localStorage.getItem('mockapi_token');
      const res = await fetch(apiUrl('/api/auth/resend-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored}` },
      });
      const json = await res.json();

      if (!res.ok) { toast.error(json.message); return; }

      toast.success('A new code has been sent to your email.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      startCooldown();
    } catch {
      toast.error('Network error. Is the server running?');
    } finally {
      setResending(false);
    }
  }

  const otpComplete = digits.every(Boolean);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500 text-white font-bold text-xl mb-3">
            M
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Check your email</h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Enter the 6-digit verification code for{' '}
            <span className="font-medium text-gray-700">{user?.email}</span>
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleSubmit}>
            {/* OTP digit boxes */}
            <div className="flex items-center justify-center gap-2.5 mb-6">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]"
                  maxLength={1}
                  value={d}
                  autoFocus={i === 0}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  className={`w-12 h-14 text-center text-xl font-bold rounded-xl border-2 transition-all outline-none
                    ${d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-900'}
                    focus:border-brand-500 focus:ring-2 focus:ring-brand-100`}
                />
              ))}
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                <p className="text-sm text-red-700 text-center">{error}</p>
              </div>
            )}

            {/* Hint */}
            <p className="text-xs text-gray-400 text-center mb-5">
              The code expires in 10 minutes. Check your spam folder if you don't see it.
            </p>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={!otpComplete}
              className="w-full py-2.5"
            >
              Verify Email
            </Button>
          </form>

          {/* Resend section */}
          <div className="text-center mt-5 pt-5 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Didn't receive a code?{' '}
              <button
                onClick={handleResend}
                disabled={cooldown > 0 || resending}
                className={`font-medium transition-colors ${cooldown > 0 || resending
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-brand-600 hover:text-brand-700'
                  }`}
              >
                {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </p>
          </div>

          {/* Wrong account? Sign out link */}
          <div className="text-center mt-3">
            <button
              onClick={() => { logout(); navigate('/login', { replace: true }); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Wrong account? Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
