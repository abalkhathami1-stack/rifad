const rateLimit = require('express-rate-limit');
const { sendError } = require('../utils/response.util');
const { ERROR_CODES } = require('../constants/error-codes');

/**
 * Rate Limiter for Authentication / Login endpoint
 * Max 10 attempts per 15 minutes per IP
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return sendError(
      res,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'تم تجاوز الحد المسموح به لمحاولات الدخول، يرجى المحاولة لاحقاً بعد 15 دقيقة',
      429
    );
  }
});

/**
 * General API Rate Limiter
 * Max 300 requests per minute
 */
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return sendError(
      res,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'تم تجاوز معدل الطلبات المسموح به، يرجى الانتظار قليلاً',
      429
    );
  }
});

module.exports = {
  authRateLimiter,
  apiRateLimiter
};
