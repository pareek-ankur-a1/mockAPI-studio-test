import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

test('public mock preflight allows external origins while dashboard preflight stays scoped', async (t) => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const preflight = (path) => fetch(`${base}${path}`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://external.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  const mock = await preflight('/api/mock/proj_test/movies');
  assert.equal(mock.status, 204);
  assert.equal(mock.headers.get('access-control-allow-origin'), '*');
  assert.equal(mock.headers.get('access-control-allow-credentials'), null);
  const dashboard = await preflight('/api/auth/login');
  assert.equal(dashboard.headers.get('access-control-allow-origin'), process.env.CLIENT_URL || 'http://localhost:5173');
  assert.match(dashboard.headers.get('access-control-allow-headers'), /Authorization/);
});
