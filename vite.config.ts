import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react()],
    base: '/',
    define: {
      'globalThis.__APP_ENV__': JSON.stringify(env),
    },
    optimizeDeps: {
      include: ['lucide-react'],
    },
    server: {
      port: 4030,
      proxy: {
        '/api': 'http://localhost:4040',
      },
      watch: {
        ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      },
    },
  };
});
