import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // docs/OFFLINE.md "Plugin configuration". The manifest colours are the only hex values allowed outside
    // rinda-theme.css, because a web manifest cannot read CSS variables.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false, // registered by useRegisterSW in UpdatePrompt
      manifest: {
        name: 'Rinda Health',
        short_name: 'Rinda',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#EBE9E1',
        theme_color: '#E43D12',
        icons: [
          { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Lazy chunks are named after their entry files; keep these names stable.
        globIgnores: [
          '**/assets/staff-routes-*.js',
          '**/assets/charts-*.js',
          '**/assets/guide-panel-*.js',
          '**/assets/clinic-card-*.js',
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    port: 5173,
    // `npm run dev`: the API is proxied under /api so everything is same-origin (no CORS).
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  preview: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } } },
  build: { sourcemap: false, target: 'es2022' },
});
