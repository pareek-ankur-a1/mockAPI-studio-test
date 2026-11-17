// Empty locally: Vite forwards /api requests to the development backend.
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').trim().replace(/\/+$/, '');
export const apiUrl = (path) => `${API_ORIGIN}${path}`;
export const backendUrl = (path) => `${API_ORIGIN || 'http://localhost:5000'}${path}`;
