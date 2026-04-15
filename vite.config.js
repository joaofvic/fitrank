import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/favicon.svg',
        'icons/apple-touch-icon.svg',
        'icons/icon-192.svg',
        'icons/icon-512.svg'
      ],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/pjlmemvwqhmpchiiqtol\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: /^https:\/\/pjlmemvwqhmpchiiqtol\.supabase\.co\/storage\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            urlPattern: /^https:\/\/pjlmemvwqhmpchiiqtol\.supabase\.co\/functions\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/pjlmemvwqhmpchiiqtol\.supabase\.co\/auth\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          admin: [
            './src/components/views/AdminTenantsView.jsx',
            './src/components/views/AdminModerationView.jsx',
            './src/components/views/AdminModerationSettingsView.jsx',
            './src/components/views/AdminUsersView.jsx',
            './src/components/views/AdminEngagementView.jsx',
            './src/components/views/AdminAuditView.jsx',
            './src/components/views/AdminChallengesView.jsx',
            './src/components/views/AdminBillingView.jsx',
            './src/components/views/AdminObservabilityView.jsx'
          ]
        }
      }
    }
  },
  server: {
    port: 3000
  }
});
