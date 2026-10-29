/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),

    // ── Aplicativo instalável (Windows, macOS, Linux, Android e iOS) ──
    VitePWA({
      registerType: 'prompt', // nunca recarrega sozinho no meio de um cadastro
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],

      manifest: {
        id: '/?origem=pwa',
        name: 'Nosso Lar — controle do enxoval',
        short_name: 'Nosso Lar',
        description:
          'Controle do enxoval, das compras e do orçamento do casal, sincronizado entre os dispositivos.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/?origem=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        background_color: '#EFECE4',
        theme_color: '#F7F6F2',
        categories: ['finance', 'productivity', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          {
            name: 'Checklist do enxoval',
            short_name: 'Checklist',
            url: '/checklist?origem=atalho',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Registrar compra',
            short_name: 'Compras',
            url: '/compras?origem=atalho',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Financeiro',
            short_name: 'Financeiro',
            url: '/financeiro?origem=atalho',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },

      workbox: {
        // A casca do aplicativo fica em cache; os dados, nunca.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/node_modules/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: '/index.html',

        // Nenhuma chamada ao Supabase passa pelo service worker: dados
        // financeiros e tokens de sessão não podem vir de cache.
        navigateFallbackDenylist: [/^\/api/, /^\/auth/],
        runtimeCaching: [],
      },

      devOptions: {
        enabled: false, // em desenvolvimento, sem service worker atrapalhando
      },
    }),
  ],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },

  build: {
    // O app desktop carrega os arquivos de um protocolo próprio, então os
    // caminhos absolutos funcionam igual na web e no Electron.
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          export: ['xlsx', 'jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
});
