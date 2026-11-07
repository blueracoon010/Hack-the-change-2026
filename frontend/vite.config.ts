import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './', // relative paths so the built app loads from file:// inside Electron
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 }, // desktop app: bundle size doesn't matter much
})
