// This is the API as Vercel runs it: the same Express app as `npm run dev`, built once per function instance.
import { createApp, createLogger, createPool, loadConfig } from './server.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const db = config.DATABASE_URL ? createPool(config.DATABASE_URL, config.DB_SCHEMA) : null;
if (!db) logger.warn('database_not_configured');

export default createApp({ config, logger, db });
