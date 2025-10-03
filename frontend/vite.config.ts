import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'


const allowedHost = 'scintillating-reverence-production.up.railway.app'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: process.env.VITE_APP_NAME || 'Belote TFE',
        short_name: 'Belote',
        theme_color: '#0ea5e9',
        background_color: '#0b1220',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === new URL(import.meta.env.VITE_API_BASE).origin,
            handler: 'StaleWhileRevalidate',
            method: 'GET',
            options: { cacheName: 'api-get' }
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/socket.io'),
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: [allowedHost]
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})