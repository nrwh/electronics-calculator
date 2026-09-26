import { defineConfig } from 'vite';
import { derivationPlugin } from './build/derivation-plugin';
import { kicadPlugin } from './build/kicad-plugin';
import { pagesPlugin } from './build/pages-plugin';

// BASE_PATH lets a custom domain (base "/") or a fork use the same build.
const base = process.env.BASE_PATH ?? '/electronics-calculator/';
const siteUrl = (process.env.SITE_URL ?? `https://nrwh.github.io${base}`).replace(/\/?$/, '/');

export default defineConfig({
  base,
  plugins: [pagesPlugin({ siteUrl }), derivationPlugin(), kicadPlugin()],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Every calculator page shares one entry script; name it for what it is.
        entryFileNames: (chunk) =>
          chunk.name.startsWith('calc/') ? 'assets/calculator-[hash].js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
