import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' so the build works on GitHub Pages and inside the Android app
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5180, host: true },
})
