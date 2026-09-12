import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { pdfjsAssetMiddleware } from './pdfjs-assets';

// PDF.js reaches for character maps when a document uses CJK or an unusual text encoding, and for
// standard font data when a document does not embed its fonts. Both ship with the app rather than
// being fetched from a CDN: the server serves only its own bundled assets, and a viewer that
// silently stopped working offline or behind a proxy would be the worst of the three outcomes.
const PDFJS_ASSET_DIRECTORIES = ['cmaps', 'standard_fonts'];

function pdfjsAssets(): Plugin {
  const packageRoot = path.dirname(
    createRequire(import.meta.url).resolve('pdfjs-dist/package.json'),
  );
  return {
    name: 'janus-pdfjs-assets',
    // The dev server emits no bundle, so the same paths are served straight from the installed
    // package instead.
    configureServer(server) {
      server.middlewares.use(pdfjsAssetMiddleware(packageRoot));
    },
    generateBundle() {
      const assets = PDFJS_ASSET_DIRECTORIES.flatMap((directory) => {
        const files = readdirSync(path.join(packageRoot, directory));
        return files.map((file) => path.join(directory, file));
      });
      for (const asset of assets) {
        // eslint-disable-next-line unicorn/no-this-outside-of-class -- a rollup plugin hook reaches its context only through `this`
        this.emitFile({
          type: 'asset',
          fileName: `pdfjs/${asset}`,
          source: readFileSync(path.join(packageRoot, asset)),
        });
      }
    },
  };
}

// The web client is built independently of the Node server (tsc compiles `src/` to `dist/`).
// Output goes to `web/dist`, which the server serves statically. `base: './'` keeps asset URLs
// relative so they load regardless of the path the app is opened at.
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react(), pdfjsAssets()],
  build: { outDir: 'dist', emptyOutDir: true },
  resolve: { alias: { '@shared': fileURLToPath(new URL('../src', import.meta.url)) } },
});
