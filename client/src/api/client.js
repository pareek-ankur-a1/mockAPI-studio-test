/**
 * @file client.js
 * @description Centralised API client — automatically attaches JWT to all
 * requests to /api/internal/* and /api/auth/me.
 *
 * Token is read fresh from localStorage on every request (not cached at
 * module load time) so logout + re-login in the same tab works correctly.
 */

import { apiUrl } from './config.js';

const BASE = apiUrl('/api');
const TOKEN_KEY = 'mockapi_token';

/** Read the current token from localStorage */
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Core fetch wrapper.
 * - Injects Authorization: Bearer <token> for internal + auth/me routes
 * - Parses JSON responses
 * - Throws structured errors for non-2xx responses
 */
async function request(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...opts.headers };

  // Attach token for all authenticated routes
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(json.message || `Request failed: ${res.status}`);
    err.status = res.status;
    err.details = json.errors || null;
    throw err;
  }

  return json;
}

// ─── API surface ──────────────────────────────────────────────────────────────

export const api = {
  projects: {
    list: () => request('/internal/projects'),
    get: (id) => request(`/internal/projects/${id}`),
    create: (body) => request('/internal/projects', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id) => request(`/internal/projects/${id}`, { method: 'DELETE' }),
  },

  resources: {
    list: (projectId) => request(`/internal/projects/${projectId}/resources`),
    create: (projectId, body) => request(`/internal/projects/${projectId}/resources`, { method: 'POST', body: JSON.stringify(body) }),
    update: (resourceId, body) => request(`/internal/resources/${resourceId}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (resourceId) => request(`/internal/resources/${resourceId}`, { method: 'DELETE' }),
  },

  seed: (resourceId, count) =>
    request('/internal/seed', { method: 'POST', body: JSON.stringify({ resourceId, count }) }),

  // Mock engine — open CORS, no auth header needed
  mock: {
    getAll: (prefix, resource, limit = 20) =>
      fetch(apiUrl(`/api/mock/${prefix}/${resource}?limit=${limit}`)).then((r) => r.json()),
    post: (prefix, resource, body) =>
      fetch(apiUrl(`/api/mock/${prefix}/${resource}`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then((r) => r.json()),
    deleteAll: (prefix, resource) =>
      fetch(apiUrl(`/api/mock/${prefix}/${resource}`), { method: 'DELETE' }).then((r) => r.json()),
  },
};
