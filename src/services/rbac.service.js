const prisma = require('../config/prisma');

class RBACService {
  /**
   * Loads all active roles, permissions, and scopes for a given user.
   * Backend is the SOLE authoritative source of truth for authorization.
   */
  static async loadUserRBAC(userId) {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });

    const roles = [];
    const permissions = new Set();
    const scopes = [];
    let isPlatformLevel = false;

    for (const assignment of assignments) {
      const roleCode = assignment.role.code;
      if (!roles.includes(roleCode)) {
        roles.push(roleCode);
      }

      if (assignment.scopeType === 'PLATFORM' || roleCode === 'PLATFORM_OWNER') {
        isPlatformLevel = true;
      }

      scopes.push({
        roleCode,
        scopeType: assignment.scopeType,
        schoolId: assignment.schoolId,
        sectionDivisionId: assignment.sectionDivisionId
      });

      for (const rp of assignment.role.rolePermissions) {
        if (rp.permission && rp.permission.code) {
          permissions.add(rp.permission.code);
        }
      }
    }

    return {
      roles,
      permissions: Array.from(permissions),
      scopes,
      isPlatformLevel
    };
  }

  /**
   * Checks if user has a specific required permission code.
   */
  static hasPermission(userPermissions, requiredPermission) {
    if (!userPermissions || !Array.isArray(userPermissions)) {
      return false;
    }
    if (userPermissions.includes('*')) {
      return true;
    }
    return userPermissions.includes(requiredPermission);
  }

  /**
   * Multi-tenancy Scope Guard: Validates that the user's scope permits access to a specific school or section.
   */
  static validateScopeAccess(scopes, { targetSchoolId = null, targetSectionDivisionId = null } = {}) {
    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return false;
    }

    // 1. Platform-level users have unrestricted access across all schools and sections
    const hasPlatformScope = scopes.some(s => s.scopeType === 'PLATFORM');
    if (hasPlatformScope) {
      return true;
    }

    // 2. If accessing a specific school resource, user must have a scope bound to that school
    if (targetSchoolId) {
      const hasSchoolAccess = scopes.some(s => s.schoolId === targetSchoolId);
      if (!hasSchoolAccess) {
        return false;
      }
    }

    // 3. If accessing a specific section division, verify section-level constraint
    if (targetSectionDivisionId) {
      const hasSectionAccess = scopes.some(s => {
        // User with school-level scope has access to all sections in that school
        if (s.scopeType === 'SCHOOL' && targetSchoolId && s.schoolId === targetSchoolId) {
          return true;
        }
        // Section-scoped user must match the specific section
        return s.scopeType === 'SECTION' && s.sectionDivisionId === targetSectionDivisionId;
      });

      if (!hasSectionAccess) {
        return false;
      }
    }

    return true;
  }
}

module.exports = RBACService;
