import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import appletConfig from './firebase-applet-config.json';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const stripePubKey =
      (env.STRIPE_PUBLISHABLE_KEY && env.STRIPE_PUBLISHABLE_KEY !== 'pk_test_51SimchaBookingKey'
        ? env.STRIPE_PUBLISHABLE_KEY
        : env.VITE_STRIPE_PUBLISHABLE_KEY) || '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss()
      ],
      define: {
        'process.env.STRIPE_PUBLISHABLE_KEY': JSON.stringify(stripePubKey),
        'process.env.APP_URL': JSON.stringify(env.APP_URL || ''),
        'process.env.GOOGLE_CLOUD_PROJECT': JSON.stringify(appletConfig.projectId || env.GOOGLE_CLOUD_PROJECT || env.PROJECT_ID || env.GCP_PROJECT || ''),
        'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(appletConfig.apiKey || env.VITE_FIREBASE_API_KEY || ''),
        'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(appletConfig.authDomain || env.VITE_FIREBASE_AUTH_DOMAIN || ''),
        'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(appletConfig.projectId || env.VITE_FIREBASE_PROJECT_ID || ''),
        'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(appletConfig.storageBucket || env.VITE_FIREBASE_STORAGE_BUCKET || ''),
        'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(appletConfig.messagingSenderId || env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''),
        'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(appletConfig.appId || env.VITE_FIREBASE_APP_ID || ''),
        'import.meta.env.VITE_FIREBASE_DATABASE_ID': JSON.stringify(appletConfig.firestoreDatabaseId || env.VITE_FIREBASE_DATABASE_ID || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(process.cwd(), '.'),
        }
      }
    };
});
