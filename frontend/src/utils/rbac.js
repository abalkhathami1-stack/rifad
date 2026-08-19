/**
 * RBAC Utility Helpers
 * Strict reflection of Backend RBAC permission evaluation
 */

/**
 * Evaluates whether the current user has a specific permission code.
 * Strictly checks userPermissions array (or wildcard '*' supported by backend).
 * Zero role, scope, or platform-level bypass.
 */
export function hasPermission(userPermissions = [], requiredPermission) {
  if (!requiredPermission) return true;
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  if (userPermissions.includes('*')) return true;
  return userPermissions.includes(requiredPermission);
}

/**
 * Evaluates whether the user has at least one permission in the provided array.
 */
export function hasAnyPermission(userPermissions = [], permissionsList = []) {
  if (!permissionsList || permissionsList.length === 0) return true;
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  if (userPermissions.includes('*')) return true;
  return permissionsList.some((perm) => userPermissions.includes(perm));
}
