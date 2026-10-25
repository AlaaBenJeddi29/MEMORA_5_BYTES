import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend CORS allowlist is configured for port 3000, so the dev server
// must run there and must fail loudly if the port is already taken. API calls
// are proxied so the browser sees one origin and sends session/CSRF cookies.
// Module 2 dev server runs on port 3000.
// The proxy forwards /api/ and /media/ to Django, allowing the SPA
// to communicate with the backend during local development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        // Rewrite Set-Cookie domain so the browser stores the session cookie
        // under localhost (the origin the SPA is served from).
        cookieDomainRewrite: 'localhost',
      },
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
})