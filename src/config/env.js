require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const MIN_SECRET_LENGTH = 32;

// Legacy, publicly-visible development default values.
// Centralized here ONLY — this is the single source of truth for both the
// development fallback and the production rejection check below.
// These are intentionally NOT strong secrets; they must never be used in production.
const LEGACY_INSECURE_DEFAULTS = {
  COOKIE_SECRET: 'rifad_cookie_secret_dev_key_2026',
  PII_ENCRYPTION_KEY: 'rifad_pii_encryption_key_32_bytes_len_2026!',
  BLIND_INDEX_SALT: 'rifad_blind_index_salt_secure_2026!'
};

/**
 * Centralized Secret Validation:
 * - Production: fails fast (throws) if the named secret is missing, blank,
 *   shorter than MIN_SECRET_LENGTH, or still equal to the known legacy
 *   development default. Never logs or throws the actual secret value.
 * - Development / Test: preserves the exact prior fallback behavior so local
 *   setup and existing test suites keep working unchanged.
 */
function resolveSecret(name) {
  const rawValue = process.env[name];
  const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
  const legacyDefault = LEGACY_INSECURE_DEFAULTS[name];

  if (!isProduction) {
    return trimmedValue.length > 0 ? rawValue : legacyDefault;
  }

  if (trimmedValue.length === 0) {
    throw new Error(`❌ ${name} is missing or insecure in production. It must be set to a strong secret value of at least ${MIN_SECRET_LENGTH} characters.`);
  }

  if (trimmedValue === legacyDefault) {
    throw new Error(`❌ ${name} is missing or insecure in production. It is still set to the known development default and must be replaced with a unique strong secret.`);
  }

  if (trimmedValue.length < MIN_SECRET_LENGTH) {
    throw new Error(`❌ ${name} is missing or insecure in production. It must be at least ${MIN_SECRET_LENGTH} characters long.`);
  }

  return rawValue;
}

const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'rifad_session',
  SESSION_TTL_DAYS: parseInt(process.env.SESSION_TTL_DAYS || '7', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  COOKIE_SECRET: resolveSecret('COOKIE_SECRET'),
  PII_ENCRYPTION_KEY: resolveSecret('PII_ENCRYPTION_KEY'),
  BLIND_INDEX_SALT: resolveSecret('BLIND_INDEX_SALT'),
  isProduction
};

if (!env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is not set in environment variables.');
}

module.exports = env;
