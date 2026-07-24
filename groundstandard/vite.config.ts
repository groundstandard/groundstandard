import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/rewrite': {
        target: 'https://primary-production-aa130.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/rewrite/, '/webhook/rewrite'),
      },
      '/api/research': {
        target: 'https://primary-production-aa130.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/research/, '/webhook/Research'),
      },
      '/api/write': {
        target: 'https://primary-production-aa130.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/write/, '/webhook/Write'),
      },
      '/api/tag': {
        target: 'https://primary-production-aa130.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/tag/, '/webhook/Tag'),
      },
      '/api/chat-bot': {
        target: 'https://primary-production-aa130.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/chat-bot/, '/webhook/chat-bot'),
      },
      '/api/video-caption': {
        target: 'https://primary-production-aa130.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/video-caption/, '/webhook/video-caption'),
      },
      '/api/image-batch': {
        target: 'https://primary-production-aa130.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/image-batch/, '/webhook/image-batch'),
      },
      '/api/image': {
        target: 'https://groundstandard.app.n8n.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/image/, '/webhook/image'),
      },
      '/api/scrapper': {
        target: 'https://groundstandard.app.n8n.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/scrapper/, '/webhook/scrapper'),
      },
    },
  },
  optimizeDeps: {
    include: ['lucide-react'],
  },
});
