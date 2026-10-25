import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Module 2 dev server runs on port 3000.
// The proxy forwards /api/ and /media/ to Django, rewriting cookies so the
// browser sees them as coming from localhost:3000 (same origin as the SPA).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Rewrite Set-Cookie domain so the browser stores the session cookie
        // under localhost (the origin the SPA is served from).
        cookieDomainRewrite: 'localhost',
      },
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
})
