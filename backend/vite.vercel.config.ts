// This bundles the API for Vercel into one plain JavaScript file. The shared @rinda packages are written in
// TypeScript, so they go inside the bundle; everything else (express, pg, argon2 and so on) stays an ordinary
// dependency that Vercel installs and traces.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'vercel-app.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'vercel-app.mjs', format: 'es' } },
  },
  ssr: { noExternal: [/^@rinda\//] },
});
