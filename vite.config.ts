import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/register': 'http://localhost:8002',
      '/auth': 'http://localhost:8002',
      '/me': 'http://localhost:8002',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});


