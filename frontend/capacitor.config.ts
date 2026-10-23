import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'rw.rinda.health',
  appName: 'Rinda Health',
  webDir: 'dist',
  server: {
    url: 'https://rinda-health.vercel.app',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['rinda-health.vercel.app'],
  },
};

export default config;
