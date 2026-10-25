import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND_URL = 'http://127.0.0.1:8000'

// Route API and media requests through the dev server so the browser sees one
// origin. That keeps the session/CSRF cookies first-party and avoids the
// unsafe-looking cross-site `Set-Cookie` handling. The original Host header is
// preserved (changeOrigin is off), so Django's CSRF Origin check still matches.
const devProxy = {
  '/api': { target: BACKEND_URL },
  '/media': { target: BACKEND_URL },
}

// The dev server must stay on port 3000 and fail loudly if it is taken.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: devProxy,
  },
  preview: {
    port: 3000,
    strictPort: true,
    proxy: devProxy,
  },
})
