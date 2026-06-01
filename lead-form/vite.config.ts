import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import uipathCodedApps from '@uipath/coded-apps-dev/vite'

export default defineConfig({
  plugins: [react(), uipathCodedApps()],
  base: './',
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      path: 'path-browserify',
    },
  },
  optimizeDeps: {
    include: ['@uipath/uipath-typescript'],
  },
})
