import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve as pathResolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'simple-liquid-glass': pathResolve(__dirname, '..', 'src'),
    },
  },
})
