import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend CORS allowlist is configured for port 3000, so the dev server
// must run there and must fail loudly if the port is already taken.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    // Proxy all /api/* requests to the Django backend
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
})
