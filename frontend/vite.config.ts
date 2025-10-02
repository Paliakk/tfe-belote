// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Utilise VITE_API_BASE / VITE_API_WS (définis dans .env)
const API_BASE = process.env.VITE_API_BASE || 'http://localhost:3000'
const API_ORIGIN = new URL(API_BASE).origin

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      // permet le SW en dev si besoin: pnpm dev && PWA_DEV=1
      devOptions: { enabled: process.env.PWA_DEV === '1' },
      includeAssets: ['robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Belote TFE',
        short_name: 'Belote',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#0ea5e9',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/offline.html',
        runtimeCaching: [
          // 1) API GET lecture → SWR
          {
            urlPattern: ({ url, request }) =>
              url.origin === API_ORIGIN &&
              request.method === 'GET' &&
              // on évite toute route ws/socket.io et les routes d’action
              !url.pathname.includes('/socket.io') &&
              !/\/(play|bidding|lobby|game)\b/i.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-swr', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 } }
          },
          // 2) Images/medias → Cache First
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          // 3) Socket.io → jamais en cache
          {
            urlPattern: ({ url }) => url.pathname.includes('/socket.io'),
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  server: { port: 5173, strictPort: true },
  resolve: { alias: { '@': '/src' } }
})
