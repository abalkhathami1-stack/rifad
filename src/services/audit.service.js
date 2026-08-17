const prisma = require('../config/prisma');

class AuditService {
  /**
   * Records a high-level operational or security audit event in audit_logs.
   */
  static async logAuditEvent({
    requestId = null,
    schoolId = null,
    userId = null,
    eventType,
    entityName,
    entityId = null,
    action,
    oldData = null,
    newData = null,
    ipAddress = null,
    userAgent = null
  }) {
    try {
      return await prisma.auditLog.create({
        data: {
          requestId,
          schoolId,
          userId,
          eventType,
          entityName,
          entityId,
          action,
          oldData: oldData ? JSON.parse(JSON.stringify(oldData)) : undefined,
          newData: newData ? JSON.parse(JSON.stringify(newData)) : undefined,
          ipAddress,
          userAgent
        }
      });
    } catch (error) {
      // Never throw unhandled error from audit logger to avoid blocking main business flow
      console.error('⚠️ [AuditService Error] Failed to write audit log:', error.message);
      return null;
    }
  }

  /**
   * Records an authentication attempt in login_attempts for rate-limiting and security analysis.
   */
  static async logLoginAttempt({
    username,
    ipAddress = null,
    userAgent = null,
    isSuccess,
    failureReason = null
  }) {
    try {
      return await prisma.loginAttempt.create({
        data: {
          username,
          ipAddress,
          userAgent,
          isSuccess,
          failureReason
        }
      });
    } catch (error) {
      console.error('⚠️ [AuditService Error] Failed to write login attempt:', error.message);
      return null;
    }
  }
}

module.exports = AuditService;
