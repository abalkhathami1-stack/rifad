const crypto = require('crypto');
const env = require('../config/env');

// Resolved centrally (with production fail-fast validation) in src/config/env.js.
// Do NOT read process.env directly here — this avoids duplicating fallback/
// validation logic across files.
const ENCRYPTION_KEY = env.PII_ENCRYPTION_KEY;
const BLIND_INDEX_SALT = env.BLIND_INDEX_SALT;

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new Error('Token must be a non-empty string for hashing.');
  }
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRequestId() {
  return `req_${crypto.randomUUID()}`;
}

/**
 * Encrypts sensitive string using AES-256-GCM
 */
function encryptText(plainText) {
  if (!plainText) return null;
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM ciphertext
 */
function decryptText(cipherText) {
  if (!cipherText || !cipherText.includes(':')) return null;
  try {
    const [ivHex, authTagHex, encryptedHex] = cipherText.split(':');
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('⚠️ [Crypto Decrypt Error]: Failed to decrypt ciphertext');
    return null;
  }
}

/**
 * Computes deterministic HMAC-SHA256 blind index hash for indexed queries
 */
function computeBlindHash(text) {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();
  return crypto.createHmac('sha256', BLIND_INDEX_SALT).update(normalized).digest('hex');
}

module.exports = {
  generateOpaqueToken,
  hashToken,
  generateRequestId,
  encryptText,
  decryptText,
  computeBlindHash
};
