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

  /**
   * RIFAD-GAP-017 Phase 0E.1 — Section-Scope Access Helper.
   *
   * Cross-cutting RBAC concern: computes a caller's effective SECTION-level
   * access for a given school, expressed as either "unrestricted" (sees every
   * section in the school — PLATFORM caller, or a SCHOOL-scoped assignment
   * for this exact school) or a specific, possibly multi-valued, set of
   * allowed sectionDivisionIds (one or more SECTION-scoped assignments for
   * this school).
   *
   * This intentionally does NOT reimplement section-matching: the
   * "unrestricted" branch reads the same PLATFORM/SCHOOL precedence
   * validateScopeAccess already applies, and every individual SECTION
   * candidate's accept/reject decision is delegated straight to
   * validateScopeAccess itself (see below) — there is exactly one
   * authoritative algorithm for "is this section allowed", reused here.
   * A second, independent primitive exists only because list-style callers
   * (Prisma `where` filters) need an allowed-ID *set* up front, which a
   * single-target yes/no check cannot produce on its own — an "unrestricted"
   * SCHOOL/PLATFORM caller must see sections with zero UserRoleAssignment
   * pointing at them at all, so the allowed set cannot be derived purely by
   * filtering the caller's own SECTION-type assignments.
   *
   * Callers needing a single object-level yes/no check (update/delete/create
   * of one specific resource) should call RBACService.validateScopeAccess
   * directly instead of this helper.
   */
  static resolveSectionScope(scopes, schoolId) {
    const scopeList = Array.isArray(scopes) ? scopes : [];

    const isUnrestricted =
      scopeList.some(s => s.scopeType === 'PLATFORM') ||
      scopeList.some(s => s.scopeType === 'SCHOOL' && s.schoolId === schoolId);

    if (isUnrestricted) {
      return { unrestricted: true, allowedSectionIds: [] };
    }

    const candidateSectionIds = [...new Set(
      scopeList
        .filter(s => s.scopeType === 'SECTION' && s.schoolId === schoolId && s.sectionDivisionId)
        .map(s => s.sectionDivisionId)
    )];

    // Delegate the actual per-candidate accept/reject decision to
    // validateScopeAccess — this loop only supplies candidate IDs to check,
    // it does not decide anything about section matching itself.
    const allowedSectionIds = candidateSectionIds.filter(sectionId =>
      this.validateScopeAccess(scopeList, { targetSchoolId: schoolId, targetSectionDivisionId: sectionId })
    );

    return { unrestricted: false, allowedSectionIds };
  }
}

module.exports = RBACService;
