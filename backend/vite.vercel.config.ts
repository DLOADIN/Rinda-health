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
