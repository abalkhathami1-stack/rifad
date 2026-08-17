const express = require('express');
const AuthController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');
const { authRateLimiter } = require('../middlewares/rate-limiter.middleware');

const router = express.Router();

// Public routes
router.post('/login', authRateLimiter, AuthController.login);

// Protected routes (Require active HttpOnly Cookie session)
router.get('/me', authenticate, AuthController.getMe);
router.post('/logout', authenticate, AuthController.logout);
router.post('/logout-all', authenticate, AuthController.logoutAll);

module.exports = router;
