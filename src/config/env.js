require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'rifad_session',
  SESSION_TTL_DAYS: parseInt(process.env.SESSION_TTL_DAYS || '7', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'rifad_cookie_secret_dev_key_2026',
  isProduction: process.env.NODE_ENV === 'production'
};

if (!env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is not set in environment variables.');
}

module.exports = env;
