/**
 * User Status & Scope Type Display Helpers (Presentation Only)
 *
 * Strictly maps Backend enum values (prisma/schema.prisma: UserStatus, ScopeType)
 * to Arabic display labels and existing global badge classes (see index.css).
 * Presentation-only — plays no role in authorization or business logic.
 *
 * Role labels are intentionally NOT duplicated here — see ../utils/roleLabels.js,
 * which is the single source of truth for role code -> Arabic label mapping.
 */

export const USER_STATUS_LABELS_AR = {
  ACTIVE: 'نشط',
  INACTIVE: 'غير نشط',
  SUSPENDED: 'معلّق'
};

export const SCOPE_TYPE_LABELS_AR = {
  PLATFORM: 'نطاق المنصة العام',
  SCHOOL: 'نطاق المدرسة',
  SECTION: 'نطاق القسم التعليمي'
};

/** Formats a UserStatus enum value into its Arabic label. Never renders raw "undefined". */
export function formatUserStatus(status) {
  if (!status || typeof status !== 'string') return 'غير محدد';
  return USER_STATUS_LABELS_AR[status] || status;
}

/** Formats a ScopeType enum value into its Arabic label. */
export function formatScopeType(scopeType) {
  if (!scopeType || typeof scopeType !== 'string') return 'غير محدد';
  return SCOPE_TYPE_LABELS_AR[scopeType] || scopeType;
}

/** Maps UserStatus to an existing global badge class (see index.css). */
export function getUserStatusBadgeClass(status) {
  switch (status) {
    case 'ACTIVE':
      return 'badge-success';
    case 'INACTIVE':
      return 'badge-warning';
    case 'SUSPENDED':
      return 'badge-error';
    default:
      return 'badge-primary';
  }
}
