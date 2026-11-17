import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api requests to the Express server during development.
    // This avoids CORS issues when calling the INTERNAL dashboard API
    // (which is restricted to CLIENT_URL). The mock engine already has
    // open CORS so it could be called directly, but proxying keeps the
    // client code consistent (all API calls use relative paths).
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
