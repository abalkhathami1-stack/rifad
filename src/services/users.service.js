const argon2 = require('argon2');
const prisma = require('../config/prisma');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');
const AuditService = require('./audit.service');

const USER_SELECT_FIELDS = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  status: true,
  isMfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roleAssignments: {
    select: {
      id: true,
      scopeType: true,
      schoolId: true,
      sectionDivisionId: true,
      createdAt: true,
      role: {
        select: {
          id: true,
          code: true,
          nameAr: true,
          nameEn: true
        }
      },
      school: {
        select: {
          id: true,
          code: true,
          nameAr: true
        }
      }
    }
  }
};

class UsersService {
  /**
   * Lists users based on the caller's multi-tenancy scope.
   */
  static async listUsers({ callerUser, callerScopes = [], isPlatformLevel = false, query = {} }) {
    const { status, search, schoolId, roleCode, page = 1, limit = 20 } = query;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const where = {
      deletedAt: null
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Enforce Scope Filtering
    if (isPlatformLevel) {
      if (schoolId) {
        where.roleAssignments = {
          some: { schoolId }
        };
      }
    } else {
      // Caller is restricted to their assigned school(s)
      const allowedSchoolIds = callerScopes
        .map(s => s.schoolId)
        .filter(Boolean);

      if (allowedSchoolIds.length === 0) {
        return { users: [], total: 0, page: 1, limit: take };
      }

      where.roleAssignments = {
        some: {
          schoolId: { in: allowedSchoolIds }
        }
      };
    }

    if (roleCode) {
      where.roleAssignments = {
        ...where.roleAssignments,
        some: {
          ...where.roleAssignments?.some,
          role: { code: roleCode }
        }
      };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: USER_SELECT_FIELDS,
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ]);

    return {
      users,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      totalPages: Math.ceil(total / take)
    };
  }

  /**
   * Retrieves single user details enforcing multi-tenancy scope.
   */
  static async getUserById(id, { callerUser, callerScopes = [], isPlatformLevel = false }) {
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT_FIELDS
    });

    if (!user) {
      throw new AppError('المستخدم المطلوب غير موجود', 404, ERROR_CODES.NOT_FOUND);
    }

    // Verify scope access if not platform level
    if (!isPlatformLevel) {
      const allowedSchoolIds = callerScopes.map(s => s.schoolId).filter(Boolean);
      const isTargetInSameSchool = user.roleAssignments.some(
        a => a.schoolId && allowedSchoolIds.includes(a.schoolId)
      );

      const isTargetPlatformOwner = user.roleAssignments.some(
        a => a.role.code === 'PLATFORM_OWNER' || a.scopeType === 'PLATFORM'
      );

      if (!isTargetInSameSchool || isTargetPlatformOwner) {
        throw new AppError(
          'غير مصرح لك باستعراض بيانات هذا المستخدم',
          403,
          ERROR_CODES.FORBIDDEN_SCOPE_VIOLATION
        );
      }
    }

    return user;
  }

  /**
   * Creates a new user with secure password hashing and role assignment.
   */
  static async createUser({
    callerUser,
    callerScopes = [],
    isPlatformLevel = false,
    data,
    context = {}
  }) {
    const { username, password, email, fullName, roleCode, scopeType, schoolId, sectionDivisionId } = data;

    if (!username || !password || !fullName) {
      throw new AppError('اسم المستخدم، كلمة المرور، والاسم الكامل حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Check duplicate username
    const existing = await prisma.user.findFirst({
      where: { username: username.trim(), deletedAt: null }
    });

    if (existing) {
      throw new AppError('اسم المستخدم مستخدم مسبقاً، يرجى اختيار اسم مستخدم آخر', 409, ERROR_CODES.CONFLICT);
    }

    // Privilege Escalation Check: Non-platform users cannot create Platform Owners or assign outside their school
    if (roleCode || scopeType) {
      if (roleCode === 'PLATFORM_OWNER' || scopeType === 'PLATFORM') {
        if (!isPlatformLevel) {
          throw new AppError(
            'غير مصرح لك بإنشاء حساب بدور مالك المنصة أو بنطاق المنصة العام',
            403,
            ERROR_CODES.FORBIDDEN_INSUFFICIENT_PERMISSIONS
          );
        }
      }

      if (!isPlatformLevel) {
        const callerSchoolIds = callerScopes.map(s => s.schoolId).filter(Boolean);
        if (!schoolId || !callerSchoolIds.includes(schoolId)) {
          throw new AppError(
            'لا يمكنك إنشاء مستخدمين خارج نطاق المدرسة المسندة إليك',
            403,
            ERROR_CODES.FORBIDDEN_SCOPE_VIOLATION
          );
        }
      }
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });

    // Execute atomic creation
    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: username.trim(),
          email: email?.trim() || null,
          fullName: fullName.trim(),
          passwordHash,
          status: 'ACTIVE',
          isMfaEnabled: false
        }
      });

      let roleAssignment = null;
      if (roleCode) {
        const role = await tx.role.findUnique({ where: { code: roleCode } });
        if (!role) {
          throw new AppError(`الدور [${roleCode}] غير معرف في النظام`, 400, ERROR_CODES.BAD_REQUEST);
        }

        roleAssignment = await tx.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: role.id,
            scopeType: scopeType || (roleCode === 'PLATFORM_OWNER' ? 'PLATFORM' : 'SCHOOL'),
            schoolId: scopeType === 'PLATFORM' ? null : schoolId,
            sectionDivisionId: sectionDivisionId || null
          }
        });
      }

      // Write Audit Log
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: schoolId || null,
          userId: callerUser.id,
          eventType: 'USER_CREATED',
          entityName: 'User',
          entityId: user.id,
          action: 'CREATE',
          newData: {
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            initialRole: roleCode || null,
            scopeType: scopeType || null,
            schoolId: schoolId || null
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return user;
    });

    return await this.getUserById(createdUser.id, { callerUser, callerScopes, isPlatformLevel });
  }

  /**
   * Updates basic user profile info.
   */
  static async updateUser(id, { callerUser, callerScopes = [], isPlatformLevel = false, data, context = {} }) {
    const existing = await this.getUserById(id, { callerUser, callerScopes, isPlatformLevel });

    const updateData = {};
    if (data.fullName !== undefined) updateData.fullName = data.fullName.trim();
    if (data.email !== undefined) updateData.email = data.email ? data.email.trim() : null;

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: updateData,
        select: USER_SELECT_FIELDS
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: context.schoolId || null,
          userId: callerUser.id,
          eventType: 'USER_UPDATED',
          entityName: 'User',
          entityId: user.id,
          action: 'UPDATE',
          oldData: { fullName: existing.fullName, email: existing.email },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return user;
    });

    return updated;
  }

  /**
   * Activates, deactivates, or suspends a user.
   */
  static async updateUserStatus(id, { callerUser, callerScopes = [], isPlatformLevel = false, status, context = {} }) {
    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
      throw new AppError('حالة المستخدم غير صالحة', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const targetUser = await this.getUserById(id, { callerUser, callerScopes, isPlatformLevel });

    // Prevent deactivating own account if Platform Owner
    if (callerUser.id === id && status !== 'ACTIVE') {
      throw new AppError('لا يمكنك تعطيل أو تعليق حسابك الخاص', 400, ERROR_CODES.BAD_REQUEST);
    }

    // Update status and revoke sessions if inactive
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { status },
        select: USER_SELECT_FIELDS
      });

      if (status !== 'ACTIVE') {
        await tx.userSession.updateMany({
          where: { userId: id, isRevoked: false },
          data: { isRevoked: true }
        });
      }

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: context.schoolId || null,
          userId: callerUser.id,
          eventType: 'USER_STATUS_CHANGED',
          entityName: 'User',
          entityId: user.id,
          action: 'UPDATE',
          oldData: { status: targetUser.status },
          newData: { status },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return user;
    });

    return updated;
  }

  /**
   * Resets a user's password securely and revokes all active sessions.
   */
  static async resetPassword(id, { callerUser, callerScopes = [], isPlatformLevel = false, newPassword, context = {} }) {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new AppError('كلمة المرور الجديدة يجب ألا تقل عن 8 خانات', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const targetUser = await this.getUserById(id, { callerUser, callerScopes, isPlatformLevel });

    // Non-platform user cannot reset password of Platform Owner
    const isTargetPlatformOwner = targetUser.roleAssignments.some(
      a => a.role.code === 'PLATFORM_OWNER' || a.scopeType === 'PLATFORM'
    );
    if (isTargetPlatformOwner && !isPlatformLevel) {
      throw new AppError('غير مصرح لك بإعادة تعيين كلمة مرور مالك المنصة', 403, ERROR_CODES.FORBIDDEN_INSUFFICIENT_PERMISSIONS);
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null
        }
      });

      // Revoke all existing sessions
      await tx.userSession.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: context.schoolId || null,
          userId: callerUser.id,
          eventType: 'USER_PASSWORD_RESET',
          entityName: 'User',
          entityId: id,
          action: 'UPDATE',
          newData: { reason: 'ADMIN_PASSWORD_RESET' },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم إعادة تعيين كلمة المرور بنجاح وإلغاء كافة الجلسات النشطة للمستخدم' };
  }

  /**
   * Assigns a role to a user with scope validation.
   */
  static async assignRole(userId, {
    callerUser,
    callerScopes = [],
    isPlatformLevel = false,
    roleCode,
    scopeType = 'SCHOOL',
    schoolId = null,
    sectionDivisionId = null,
    context = {}
  }) {
    const targetUser = await this.getUserById(userId, { callerUser, callerScopes, isPlatformLevel });

    // 1. Role existence check
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      throw new AppError(`الدور [${roleCode}] غير موجود`, 404, ERROR_CODES.NOT_FOUND);
    }

    // 2. Privilege Escalation Guard
    if (roleCode === 'PLATFORM_OWNER' || scopeType === 'PLATFORM') {
      if (!isPlatformLevel) {
        throw new AppError(
          'غير مصرح لك بإسناد دور مالك المنصة أو نطاق المنصة العام',
          403,
          ERROR_CODES.FORBIDDEN_INSUFFICIENT_PERMISSIONS
        );
      }
    }

    if (!isPlatformLevel) {
      const callerSchoolIds = callerScopes.map(s => s.schoolId).filter(Boolean);
      if (!schoolId || !callerSchoolIds.includes(schoolId)) {
        throw new AppError(
          'لا يمكنك إسناد أدوار خارج نطاق المدرسة المخصصة لك',
          403,
          ERROR_CODES.FORBIDDEN_SCOPE_VIOLATION
        );
      }
    }

    // 3. Duplicate check
    const existing = await prisma.userRoleAssignment.findFirst({
      where: {
        userId,
        roleId: role.id,
        scopeType,
        schoolId: scopeType === 'PLATFORM' ? null : schoolId,
        sectionDivisionId: sectionDivisionId || null
      }
    });

    if (existing) {
      throw new AppError('هذا الدور مسند للمستخدم مسبقاً بنفس النطاق', 409, ERROR_CODES.CONFLICT);
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.userRoleAssignment.create({
        data: {
          userId,
          roleId: role.id,
          scopeType,
          schoolId: scopeType === 'PLATFORM' ? null : schoolId,
          sectionDivisionId: sectionDivisionId || null
        },
        include: {
          role: true,
          school: true
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: schoolId || null,
          userId: callerUser.id,
          eventType: 'ROLE_ASSIGNED',
          entityName: 'UserRoleAssignment',
          entityId: created.id,
          action: 'CREATE',
          newData: {
            userId,
            roleCode,
            scopeType,
            schoolId,
            sectionDivisionId
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return created;
    });

    return assignment;
  }

  /**
   * Removes a role assignment from a user.
   */
  static async removeRole(userId, assignmentId, {
    callerUser,
    callerScopes = [],
    isPlatformLevel = false,
    context = {}
  }) {
    const targetUser = await this.getUserById(userId, { callerUser, callerScopes, isPlatformLevel });

    const assignment = await prisma.userRoleAssignment.findFirst({
      where: { id: assignmentId, userId },
      include: { role: true }
    });

    if (!assignment) {
      throw new AppError('سجل إسناد الدور غير موجود', 404, ERROR_CODES.NOT_FOUND);
    }

    // Non-platform owner cannot remove PLATFORM_OWNER role
    if (assignment.role.code === 'PLATFORM_OWNER' && !isPlatformLevel) {
      throw new AppError(
        'غير مصرح لك بإلغاء دور مالك المنصة',
        403,
        ERROR_CODES.FORBIDDEN_INSUFFICIENT_PERMISSIONS
      );
    }

    // Prevent removing the last Platform Owner in the system
    if (assignment.role.code === 'PLATFORM_OWNER') {
      const totalOwners = await prisma.userRoleAssignment.count({
        where: { role: { code: 'PLATFORM_OWNER' } }
      });
      if (totalOwners <= 1) {
        throw new AppError('لا يمكن حذف دور مالك المنصة الوحيد في النظام', 400, ERROR_CODES.BAD_REQUEST);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.delete({
        where: { id: assignmentId }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: assignment.schoolId || null,
          userId: callerUser.id,
          eventType: 'ROLE_REMOVED',
          entityName: 'UserRoleAssignment',
          entityId: assignmentId,
          action: 'DELETE',
          oldData: {
            userId,
            roleCode: assignment.role.code,
            scopeType: assignment.scopeType,
            schoolId: assignment.schoolId
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم إزالة الدور بنجاح' };
  }
}

module.exports = UsersService;
