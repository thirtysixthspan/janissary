import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web client is built independently of the Node server (tsc compiles `src/` to `dist/`).
// Output goes to `web/dist`, which the server serves statically. `base: './'` keeps asset URLs
// relative so they load regardless of the path the app is opened at.
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  resolve: { alias: { '@shared': fileURLToPath(new URL('../src', import.meta.url)) } },
});
