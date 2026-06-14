import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve as pathResolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Subpath exports first (most specific), then the package root.
      'simple-liquid-glass/interactive': pathResolve(__dirname, '..', 'src', 'interactive'),
      'simple-liquid-glass/web-component': pathResolve(__dirname, '..', 'src', 'web-component'),
      'simple-liquid-glass': pathResolve(__dirname, '..', 'src'),
    },
  },
})
