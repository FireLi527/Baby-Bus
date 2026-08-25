import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'client',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/study-assistant': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
