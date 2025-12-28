import { config } from 'dotenv';
import { resolve } from 'path';
config();
import { version } from './server/utils/config';
//https://nitro.unjs.io/config
export default defineNitroConfig({
  preset: 'cloudflare-module',
  srcDir: 'server',
  compatibilityDate: '2025-03-05',
  experimental: {
    asyncContext: true,
    tasks: true,
  },
  scheduledTasks: {
    // Daily cron jobs (midnight)
    '0 0 * * *': ['jobs:clear-metrics:daily'],
    // Weekly cron jobs (Sunday midnight)
    '0 0 * * 0': ['jobs:clear-metrics:weekly'],
    // Monthly cron jobs (1st of month at midnight)
    '0 0 1 * *': ['jobs:clear-metrics:monthly']
  },
  runtimeConfig: {
    public: {
      meta: {
        name: process.env.META_NAME || '',
        description: process.env.META_DESCRIPTION || '',
        version: version || '',
        captcha: (process.env.CAPTCHA === 'true').toString(),
        captchaClientKey: process.env.CAPTCHA_CLIENT_KEY || '',
      },
    },
    cryptoSecret: process.env.CRYPTO_SECRET,
    tmdbApiKey: process.env.TMDB_API_KEY,
    trakt: {
      clientId: process.env.TRAKT_CLIENT_ID,
      clientSecret: process.env.TRAKT_SECRET_ID,
    },
    rollupConfig: {
      plugins: [
        {
          name: 'resolve-pg-native',
          resolveId(id) {
            if (id === 'pg-native') {
              return resolve(process.cwd(), 'server/utils/pg-native-stub.js');
            }
            return null;
          },
        },
      ],
    },
  }
});