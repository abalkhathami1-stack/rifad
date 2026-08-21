const express = require('express');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const schoolsRoutes = require('./schools.routes');
const academicRoutes = require('./academic.routes');
const studentsRoutes = require('./students.routes');
const teachersRoutes = require('./teachers.routes');
const guardiansRoutes = require('./guardians.routes');
const importRoutes = require('./import.routes');
const promotionRoutes = require('./promotion.routes');
const testRoutes = require('./test.routes');
const { sendSuccess } = require('../utils/response.util');

const router = express.Router();

// Health Check
router.get('/health', (req, res) => {
  return sendSuccess(res, {
    status: 'ONLINE',
    service: 'RIFAD Core Backend API',
    version: '1.0.0'
  });
});

// Modular Domain Routes
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/schools', schoolsRoutes);
router.use('/academic', academicRoutes);
router.use('/students', studentsRoutes);
router.use('/teachers', teachersRoutes);
router.use('/guardians', guardiansRoutes);
router.use('/import', importRoutes);
router.use('/promotion', promotionRoutes);

// Test Guard Routes (for RBAC & Scope testing)
if (process.env.NODE_ENV !== 'production') {
  router.use('/test', testRoutes);
}

module.exports = router;
