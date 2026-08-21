const prisma = require('../config/prisma');

const SCHOOL_SELECT_FIELDS = {
  id: true,
  code: true,
  nameAr: true,
  nameEn: true,
  isActive: true
};

class SchoolsService {
  /**
   * Lists the schools catalog visible to the caller.
   *
   * Purpose: populate the school selector used by Users & Roles Management
   * (Create User / Assign Role) so those flows send a real schoolId instead
   * of relying on a Frontend workaround.
   *
   * Visibility is enforced purely through the caller's own RBAC scopes
   * (req.scopes / req.isPlatformLevel, attached by auth.middleware via
   * RBACService.loadUserRBAC) — the SAME contract already used by
   * AcademicService.resolveSchoolId and UsersService's own scope filtering.
   * No client input can widen visibility; there is no schoolId query param.
   *
   * - Platform-level caller: every non-deleted school.
   * - School-scoped caller: only the school(s) present in their own scopes.
   * - Section-scoped caller: a SECTION-scope UserRoleAssignment still carries
   *   its schoolId (see prisma/schema.prisma + UsersService.assignRole, which
   *   only nulls schoolId for scopeType === 'PLATFORM'), so section-scoped
   *   callers are naturally confined to their own school by the same filter —
   *   they can never see or select a school outside their assigned scope.
   *
   * Soft-deleted schools (deletedAt) are always excluded. Inactive schools
   * (isActive: false) are intentionally still RETURNED (not hidden) so an
   * admin can see and manage/select a temporarily deactivated school rather
   * than have it silently disappear; the Frontend is expected to visually
   * flag/disable inactive entries in the selector instead of omitting them.
   */
  static async listSchools({ callerScopes = [], isPlatformLevel = false }) {
    const where = { deletedAt: null };

    if (!isPlatformLevel) {
      const allowedSchoolIds = [...new Set(callerScopes.map((s) => s.schoolId).filter(Boolean))];

      if (allowedSchoolIds.length === 0) {
        return { schools: [] };
      }

      where.id = { in: allowedSchoolIds };
    }

    const schools = await prisma.school.findMany({
      where,
      select: SCHOOL_SELECT_FIELDS,
      orderBy: { nameAr: 'asc' }
    });

    return { schools };
  }
}

module.exports = SchoolsService;
