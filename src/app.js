const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const requestIdMiddleware = require('./middlewares/request-id.middleware');
const errorHandler = require('./middlewares/error.middleware');
const { apiRateLimiter } = require('./middlewares/rate-limiter.middleware');
const routes = require('./routes');
const { sendError } = require('./utils/response.util');
const { ERROR_CODES } = require('./constants/error-codes');

const app = express();

// 1. Security Headers & CORS
app.use(helmet({
  contentSecurityPolicy: env.isProduction,
  crossOriginEmbedderPolicy: env.isProduction
}));

app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
}));

// 2. Parsers & Middleware
app.use(cookieParser(env.COOKIE_SECRET));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestIdMiddleware);

// 3. Rate Limiter & API Routes
app.use('/api', apiRateLimiter);
app.use('/api/v1', routes);

// 4. Handle 404 Route Not Found
app.use((req, res) => {
  return sendError(
    res,
    ERROR_CODES.NOT_FOUND,
    `المسار المطلوب [${req.method} ${req.originalUrl}] غير موجود على الخادم`,
    404
  );
});

// 5. Central Error Handler
app.use(errorHandler);

module.exports = app;
