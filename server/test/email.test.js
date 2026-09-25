import test from 'node:test';
import assert from 'node:assert/strict';
import { sendOtpEmail } from '../src/utils/emailService.js';
import { register, resendOtp } from '../src/controllers/authController.js';
import User from '../src/models/User.js';

function configure(t) {
  const keys = ['BREVO_API_KEY', 'EMAIL_FROM', 'JWT_SECRET'];
  const previous = keys.map((key) => process.env[key]);
  process.env.BREVO_API_KEY = 'test-only-key';
  process.env.EMAIL_FROM = 'sender@example.com';
  process.env.JWT_SECRET = 'test-only-secret';
  t.after(() => keys.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key];
    else process.env[key] = previous[i];
  }));
}

test('Brevo request includes the configured sender, OTP and escaped HTML name', async (t) => {
  configure(t);
  const request = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['api-key'], 'test-only-key');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.sender.email, 'sender@example.com');
    assert.equal(body.to[0].email, 'recipient@example.com');
    assert.match(body.textContent, /123456/);
    assert.match(body.htmlContent, /&lt;script&gt;/);
    assert.doesNotMatch(body.htmlContent, /<script>/);
    return new Response('{"messageId":"test"}', { status: 201 });
  });
  await sendOtpEmail('recipient@example.com', '<script>', '123456');
  assert.equal(request.mock.callCount(), 1);
});

test('missing email configuration fails before making an external request', async (t) => {
  configure(t);
  delete process.env.BREVO_API_KEY;
  const request = t.mock.method(globalThis, 'fetch', async () => assert.fail('must not send'));
  await assert.rejects(sendOtpEmail('recipient@example.com', 'Test', '123456'), { statusCode: 503 });
  assert.equal(request.mock.callCount(), 0);
});

test('provider errors and network failures do not expose provider response data', async (t) => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => new Response('sensitive provider details', { status: 403 }));
  await assert.rejects(sendOtpEmail('recipient@example.com', 'Test', '123456'), (error) => {
    assert.equal(error.statusCode, 503);
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /sensitive|test-only-key|123456/);
    return true;
  });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network failure'); });
  await assert.rejects(sendOtpEmail('recipient@example.com', 'Test', '123456'), { statusCode: 503 });
});

test('resend forwards a delivery error instead of reporting success', async (t) => {
  configure(t);
  const user = { email: 'recipient@example.com', name: 'Test', isVerified: false, async save() {} };
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));
  let failure;
  await resendOtp({ user: { userId: 'test' } }, {
    status() { assert.fail('must not report success'); },
  }, (error) => { failure = error; });
  assert.equal(failure.statusCode, 503);
});

test('registration retains its token and reports email failure so the user can resend', async (t) => {
  configure(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(User, 'findOne', async () => null);
  t.mock.method(User, 'create', async (data) => ({ ...data, _id: 'test-user', isVerified: false, async save() {} }));
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }));
  let payload;
  await register({ body: { name: 'Test', email: 'recipient@example.com', password: 'test-password-123' } }, {
    status(code) { assert.equal(code, 201); return this; },
    json(body) { payload = body; },
  }, (error) => { throw error; });
  assert.equal(payload.emailSent, false);
  assert.ok(payload.token);
  assert.match(payload.message, /could not be sent/);
});
