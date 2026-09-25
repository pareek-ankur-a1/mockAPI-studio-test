import { OTP_TTL_MINUTES } from './otpHelper.js';

function otpEmailHtml(name, otp) {
  const digits = otp.split('').map((d) => `
    <span style="
      display:inline-block;
      width:44px; height:56px; line-height:56px;
      margin:0 4px;
      background:#f3f4f6;
      border:1.5px solid #e5e7eb;
      border-radius:10px;
      font-size:28px; font-weight:700;
      color:#111827;
      text-align:center;
      font-family:'Courier New',monospace;
    ">${d}</span>`
  ).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:#111827;padding:24px 32px;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.5px;">
              MockAPI <span style="color:#22c55e;">Studio</span>
            </span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
              Verify your email address
            </p>
            <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
              Hi ${name.split(' ')[0]}, welcome to MockAPI Studio! Use the code below
              to complete your registration. It expires in
              <strong>${OTP_TTL_MINUTES} minutes</strong>.
            </p>

            <!-- OTP boxes -->
            <div style="text-align:center;margin:28px 0;">${digits}</div>

            <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
              If you didn't create an account, you can safely ignore this email.
              <br/>Never share this code with anyone — MockAPI Studio will never ask for it.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              © ${new Date().getFullYear()} MockAPI Studio · Automated message, please do not reply.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Sends an OTP verification email through Brevo's HTTPS API.
 *
 * @param {string} to    Recipient email address
 * @param {string} name  Recipient's display name (for personalisation)
 * @param {string} otp   The PLAINTEXT 6-digit OTP (not the hash)
 * @returns {Promise<void>}
 */

export async function sendOtpEmail(to, name, otp) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const sender = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !sender) {
    const error = new Error('Email delivery is not configured. Set BREVO_API_KEY and EMAIL_FROM.');
    error.statusCode = 503;
    throw error;
  }

  // Names are user input and must not become markup in the email template.
  const safeName = String(name).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  let response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        sender: { name: 'MockAPI Studio', email: sender },
        to: [{ email: to, name }],
        subject: 'Your MockAPI Studio verification code',
        htmlContent: otpEmailHtml(safeName, otp),
        textContent: `Your verification code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      }),
    });
  } catch {
    const error = new Error('Email service is temporarily unreachable. Please try resending the code.');
    error.statusCode = 503;
    throw error;
  }
  if (!response.ok) {
    // Do not expose credentials, OTPs, or provider response bodies in logs/errors.
    const error = new Error(`Email service rejected the request (HTTP ${response.status}). Check the Brevo key, authorized IPs, sender verification, and sending quota.`);
    error.statusCode = 503;
    throw error;
  }
  // Consume the response so its HTTP connection can be reused.
  await response.text();
}
