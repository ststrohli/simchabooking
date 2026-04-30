import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.STRIPE_PUBLISHABLE_KEY': JSON.stringify(env.STRIPE_PUBLISHABLE_KEY),
        'process.env.APP_URL': JSON.stringify(env.APP_URL),
        'process.env.GOOGLE_CLOUD_PROJECT': JSON.stringify(env.GOOGLE_CLOUD_PROJECT || env.PROJECT_ID || env.GCP_PROJECT)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
