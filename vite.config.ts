import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: false,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
      '/bridge.js': {
        target: 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:4173',
        ws: true,
      },
    },
  },
});
