import { defineConfig } from 'vite';

// base './' — чтобы сборка работала и из файлов внутри APK, и на GitHub Pages
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist', chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: 'index.html', platformer: 'platformer.html' } },
  },
});
