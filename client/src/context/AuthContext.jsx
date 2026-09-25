/**
 * @file AuthContext.jsx
 * @description Global auth state — user identity, token storage, login/logout.
 *
 * Token is stored in localStorage under "mockapi_token".
 * On every app load, we call GET /api/auth/me to verify the stored token is
 * still valid (not expired, not tampered with). If it fails, we clear state.
 *
 * The `loading` state prevents the router from flashing the login page
 * before the /me verification completes on initial load.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiUrl } from '../api/config.js';

const AuthContext = createContext(null);

const TOKEN_KEY = 'mockapi_token';
const USER_KEY = 'mockapi_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true); // true while /me is being verified

  // ── On mount: verify the stored token with the server ─────────────────────
  useEffect(() => {
    async function verifyToken() {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (!stored) { setLoading(false); return; }

      try {
        const res = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${stored}` },
        });
        const json = await res.json();

        if (res.ok && json.success) {
          setUser(json.user);
          setToken(stored);
        } else {
          // Token expired or invalid — clear everything
          clearAuth();
        }
      } catch {
        clearAuth();
      } finally {
        setLoading(false);
      }
    }
    verifyToken();
  }, []);

  // ── Persist token + user to localStorage ──────────────────────────────────
  const saveAuth = useCallback((newToken, newUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{ user, token, loading, saveAuth, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook to access auth state from any component */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
