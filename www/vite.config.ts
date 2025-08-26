import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {CONFIG as SiteConfig} from './gen/site-config'

export default defineConfig({
  plugins: [react()],
  server: {
    cors: {
      origin: SiteConfig.origin.replace(/\/$/, ''),
    },
  },
  build: {
    manifest: true,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      input: "app.tsx"
    }
  },
});