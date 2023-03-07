import { resolve } from 'path';
import preact from '@preact/preset-vite';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  plugins: [preact()],
  envDir: process.cwd(),
  base: './',
  build: {
    sourcemap: false,
    target: 'node14',
    outDir: './dist',
    terserOptions: {
      ecma: 2021,
      compress: {
        passes: 2,
      },
      safari10: false,
    },
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        ui: resolve(__dirname, 'ui.html'),
      },
    },
    emptyOutDir: true,
  },
};

export default config;
