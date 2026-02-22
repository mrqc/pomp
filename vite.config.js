import { defineConfig } from 'vite';
import { resolve } from 'path';
import {nodePolyfills} from "vite-plugin-node-polyfills";

export default defineConfig({
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'frontend/index.html'),
    },
    outDir: 'public',
    emptyOutDir: false,
  }, 
  plugins: [ nodePolyfills() ],
  root: 'frontend',
});
