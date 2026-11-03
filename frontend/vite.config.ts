import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // FastAPI dev server (uv run fastapi dev) runs on 8000
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    // FastAPI serves this folder with app.frontend()
    outDir: '../backend/static',
    emptyOutDir: true,
  },
})
