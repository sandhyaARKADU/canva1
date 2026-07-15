import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001'

// https://vite.dev/config/
export default defineConfig({
  cacheDir: '/private/tmp/teckstudio-vite-cache',
  server: {
    proxy: {
      '/media': {
        target: API_BASE_URL,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '/private/tmp/teckstudio-dist',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
})
