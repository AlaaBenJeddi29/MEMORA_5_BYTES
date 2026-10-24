import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend CORS allowlist is configured for port 3000, so the dev server
// must run there and must fail loudly if the port is already taken.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    // Same-origin proxy in dev: the session and CSRF cookies stay readable by
    // the app. Requires VITE_API_BASE_URL= (empty) so requests use this origin.
    // changeOrigin is intentionally left false: Django compares the request
    // Origin with its Host, which must both be localhost:3000.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000' },
      '/media': { target: 'http://127.0.0.1:8000' },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
})
