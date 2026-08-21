import { apiClient } from './client';

/**
 * Users & Roles Management API Service
 * Maps 1:1 to the real Backend contract (src/routes/users.routes.js):
 *   GET    /api/v1/users
 *   GET    /api/v1/users/:id
 *   POST   /api/v1/users
 *   PATCH  /api/v1/users/:id
 *   PATCH  /api/v1/users/:id/status
 *   POST   /api/v1/users/:id/reset-password
 *   POST   /api/v1/users/:id/roles
 *   DELETE /api/v1/users/:id/roles/:roleAssignmentId
 *
 * Security Notes:
 * - Passwords live only in component state (memory), never persisted, never logged.
 * - No axios, no localStorage/sessionStorage, no raw backend errors surfaced.
 * - Backend remains the sole authorization/validation boundary; this layer only
 *   shapes requests/responses, it performs zero business-rule enforcement.
 */
export const UsersApi = {
  /**
   * GET /api/v1/users — server-side paginated, searchable, filterable list.
   *
   * @param {Object} [params]
   * @param {string} [params.search] - matches username / fullName / email
   * @param {string} [params.status] - 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
   * @param {string} [params.roleCode] - Role code filter
   * @param {string} [params.schoolId] - Platform-level only (ignored server-side otherwise)
   * @param {number} [params.page]
   * @param {number} [params.limit]
   * @param {AbortSignal} [signal]
   */
  async listUsers(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const res = await apiClient(qs ? `/users?${qs}` : '/users', { method: 'GET', signal });
    return res.data;
  },

  /**
   * GET /api/v1/users/:id
   * @param {string} userId
   * @param {AbortSignal} [signal]
   */
  async getUser(userId, signal = null) {
    if (!userId) throw new Error('معرف المستخدم مطلوب');
    const res = await apiClient(`/users/${encodeURIComponent(userId)}`, { method: 'GET', signal });
    return res.data;
  },

  /**
   * POST /api/v1/users
   * Required by Backend: username, password, fullName.
   * Optional: email, roleCode, scopeType, schoolId, sectionDivisionId (initial role assignment).
   * @param {Object} data
   */
  async createUser(data) {
    const res = await apiClient('/users', { method: 'POST', body: data });
    return res.data;
  },

  /**
   * PATCH /api/v1/users/:id
   * Backend only accepts fullName / email on this endpoint (username is immutable here).
   * @param {string} userId
   * @param {{fullName?: string, email?: string|null}} data
   */
  async updateUser(userId, data) {
    if (!userId) throw new Error('معرف المستخدم مطلوب');
    const res = await apiClient(`/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: data });
    return res.data;
  },

  /**
   * PATCH /api/v1/users/:id/status
   * @param {string} userId
   * @param {'ACTIVE'|'INACTIVE'|'SUSPENDED'} status
   */
  async updateUserStatus(userId, status) {
    if (!userId) throw new Error('معرف المستخدم مطلوب');
    const res = await apiClient(`/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: { status }
    });
    return res.data;
  },

  /**
   * POST /api/v1/users/:id/reset-password
   * Backend enforces newPassword.length >= 8. Response never contains the password/hash.
   * @param {string} userId
   * @param {string} newPassword
   */
  async resetUserPassword(userId, newPassword) {
    if (!userId) throw new Error('معرف المستخدم مطلوب');
    const res = await apiClient(`/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      body: { newPassword }
    });
    return res.data;
  },

  /**
   * POST /api/v1/users/:id/roles
   * @param {string} userId
   * @param {{roleCode: string, scopeType?: string, schoolId?: string, sectionDivisionId?: string}} data
   */
  async assignRole(userId, data) {
    if (!userId) throw new Error('معرف المستخدم مطلوب');
    const res = await apiClient(`/users/${encodeURIComponent(userId)}/roles`, { method: 'POST', body: data });
    return res.data;
  },

  /**
   * DELETE /api/v1/users/:id/roles/:roleAssignmentId
   * @param {string} userId
   * @param {string} roleAssignmentId
   */
  async removeRole(userId, roleAssignmentId) {
    if (!userId || !roleAssignmentId) throw new Error('معرف المستخدم ومعرف إسناد الدور مطلوبان');
    const res = await apiClient(
      `/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleAssignmentId)}`,
      { method: 'DELETE' }
    );
    return res.data;
  },

  /**
   * Frontend-safe helper (NOT a new endpoint): derives the schools the CALLER
   * themself is scoped to, by reading their own record via the existing
   * GET /api/v1/users/:id contract (self-view is always permitted — see
   * UsersService.getUserById self-scope check on the Backend).
   *
   * There is no dedicated schools-listing endpoint in this Backend yet, so this
   * is the only Frontend-safe way to obtain real school names for a school-scoped
   * caller. It intentionally returns ONLY schools the caller already belongs to —
   * it cannot and must not be used to browse all schools in the system. Platform-
   * level callers (no schoolId in their own scope) will get an empty list; the UI
   * must treat that as "school selection unavailable", never fall back to a
   * hardcoded or invented school list.
   *
   * @param {string} callerUserId
   * @returns {Promise<Array<{id: string, code: string, nameAr: string}>>}
   */
  async getMyScopedSchools(callerUserId) {
    if (!callerUserId) return [];
    const data = await this.getUser(callerUserId);
    const assignments = data?.user?.roleAssignments || [];
    const seen = new Map();
    assignments.forEach((a) => {
      if (a.school && a.school.id && !seen.has(a.school.id)) {
        seen.set(a.school.id, a.school);
      }
    });
    return Array.from(seen.values());
  }
};
