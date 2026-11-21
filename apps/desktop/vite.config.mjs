import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true },
})
