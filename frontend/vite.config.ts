import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend CORS allowlist is configured for port 3000, so the dev server
// must run there and must fail loudly if the port is already taken. API calls
// are proxied so the browser sees one origin and sends session/CSRF cookies.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
})
