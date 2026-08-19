/**
 * RIFAD Core Backend API - Operational Runtime Server
 * 
 * Purpose:
 * Production-ready entry point for starting the Express HTTP server with
 * centralized configuration, error containment, and graceful shutdown.
 */

const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');

const PORT = env.PORT || 3000;
const SHUTDOWN_TIMEOUT_MS = 10000;

let isShuttingDown = false;

// 1. Start HTTP Server
const server = app.listen(PORT, () => {
  console.log(`🚀 [RIFAD Server] Running on port ${PORT} in ${env.NODE_ENV} mode`);
  console.log(`🩺 [RIFAD Health] Endpoint: http://localhost:${PORT}/api/v1/health`);
});

// 2. Handle Server Startup Errors
server.on('error', async (error) => {
  console.error('❌ [RIFAD Server Error] Failed to start server:', error.message);
  try {
    await prisma.$disconnect();
  } catch (dbErr) {
    console.error('⚠️ [Prisma Disconnect Error]:', dbErr.message);
  }
  process.exit(1);
});

// 3. Graceful Shutdown Handler
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log(`⚠️ [RIFAD Server] Shutdown already in progress. Ignoring duplicate ${signal}.`);
    return;
  }
  isShuttingDown = true;
  console.log(`\n🛑 [RIFAD Server] Received ${signal}. Initiating graceful shutdown...`);

  // Force exit timer to prevent hanging
  const forceExitTimer = setTimeout(() => {
    console.error('⚠️ [RIFAD Server] Graceful shutdown timeout exceeded. Forcing termination.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    // a. Stop accepting new connections and close HTTP listener
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    console.log('✅ [RIFAD Server] HTTP listener closed cleanly.');

    // b. Disconnect database client
    await prisma.$disconnect();
    console.log('✅ [RIFAD Server] Database connection pool disconnected.');

    clearTimeout(forceExitTimer);
    console.log('🏁 [RIFAD Server] Graceful shutdown completed successfully.');
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExitTimer);
    console.error('❌ [RIFAD Server] Error encountered during shutdown:', err.message);
    process.exit(1);
  }
}

// 4. Process Signal Listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 5. Uncaught Exception and Unhandled Rejection Guards
process.on('uncaughtException', (err) => {
  console.error('💥 [RIFAD Server] Uncaught Exception:', err.message);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 [RIFAD Server] Unhandled Rejection:', reason instanceof Error ? reason.message : reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = server;
