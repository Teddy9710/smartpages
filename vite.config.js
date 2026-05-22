import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { existsSync } from 'fs';
import { resolve } from 'path';

const projectRoot = resolve(__dirname);

const copyTargets = [
  // Root files
  { src: 'manifest.json', dest: '.' },
  // Static directories (copy as-is)
  { src: 'icons', dest: '.' },
  { src: 'libs', dest: '.' },
  { src: 'styles', dest: '.' },
  { src: 'skills', dest: '.' },
  { src: 'docs', dest: '.' },
  // Modules with subdirectory nesting - use rename.stripBase
  { src: 'popup/*', dest: 'popup', rename: { stripBase: 1 } },
  { src: 'sidepanel/*', dest: 'sidepanel', rename: { stripBase: 1 } },
  { src: 'settings/*', dest: 'settings', rename: { stripBase: 1 } },
  { src: 'upload/*', dest: 'upload', rename: { stripBase: 1 } },
  { src: 'background/*', dest: 'background', rename: { stripBase: 1 } },
  { src: 'content/*', dest: 'content', rename: { stripBase: 1 } },
  { src: 'utils/*', dest: 'utils', rename: { stripBase: 1 } },
].filter(target => existsSync(resolve(projectRoot, target.src.replace(/\/\*$/, ''))));

/**
 * Vite config for SmartPages Chrome Extension
 * Uses copy-based approach since Chrome Extension uses non-module scripts.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(projectRoot, 'utils/codeUtils.js'),
      formats: ['es'],
      fileName: () => '_unused_entry.js',
    },
    copyPublicDir: false,
    minify: false,
  },
  plugins: [
    viteStaticCopy({
      targets: copyTargets,
    }),
  ],
});
