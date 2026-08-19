/**
 * Role Display Labels (Presentation Only)
 *
 * Strictly maps role CODES (as returned by the backend, e.g. "SCHOOL_ADMIN")
 * to Arabic display labels. This is presentation-only — it plays NO role in
 * authorization. Authorization decisions must always go through can(permissionCode)
 * (see AuthContext), never through role labels or role codes directly.
 *
 * Backend `roles` shape (POST /auth/login and GET /auth/me) is a flat array
 * of role code strings, e.g. ["SCHOOL_ADMIN"] — NOT an array of objects.
 */

export const ROLE_LABELS_AR = {
  PLATFORM_OWNER: 'مالك المنصة',
  SCHOOL_ADMIN: 'مدير المدرسة',
  ACADEMIC_ADMIN: 'المسؤول الأكاديمي',
  REGISTRAR: 'مسؤول التسجيل',
  TEACHER: 'معلم',
  AUDITOR: 'مدقق'
};

/**
 * Formats a single role code into its Arabic display label.
 * Falls back to the raw role code if no mapping exists (never renders "undefined").
 */
export function formatRoleLabel(roleCode) {
  if (!roleCode || typeof roleCode !== 'string') return '';
  return ROLE_LABELS_AR[roleCode] || roleCode;
}

/**
 * Formats the primary (first) role from a roles string[] array.
 * Safe against undefined/empty arrays.
 */
export function formatPrimaryRoleLabel(roles, fallback = '') {
  if (!roles || !Array.isArray(roles) || roles.length === 0) return fallback;
  return formatRoleLabel(roles[0]);
}
