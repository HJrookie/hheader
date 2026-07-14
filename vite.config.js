import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(projectRoot, 'src');

// Build the extension with two entry points:
//  - src/popup/index.html        -> dist/popup/index.html (+ assets)
//  - src/background/service-worker.js -> dist/background/service-worker.js
// `root: srcDir` keeps entry paths clean so the HTML lands at dist/popup/...
// `base: './'` makes asset URLs relative so they resolve under the
// chrome-extension:// scheme (no server root).
export default defineConfig({
  root: srcDir,
  base: './',
  publicDir: resolve(projectRoot, 'public'),
  plugins: [vue()],
  server: {
    port: 3040,
  },
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(srcDir, 'popup/index.html'),
        background: resolve(srcDir, 'background/service-worker.js'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background'
            ? 'background/service-worker.js'
            : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
