import { apiClient } from './client';

/**
 * Schools Catalog API Service
 * GET /api/v1/schools — read-only, RBAC/scope-filtered entirely on the Backend.
 *
 * Used to populate real school selectors in Users & Roles Management
 * (Create User / Assign Role). Replaces the previous self-view-derived
 * workaround (UsersApi.getMyScopedSchools) now that a dedicated endpoint
 * exists.
 *
 * Security Notes:
 * - This list is for display/selection only — it is NEVER a source of
 *   authorization. The Backend independently re-validates schoolId on every
 *   mutating request (createUser / assignRole), exactly as it did before
 *   this endpoint existed.
 * - No axios, no localStorage/sessionStorage, no client-side caching of the
 *   result beyond component state.
 */
export const SchoolsApi = {
  /**
   * @param {AbortSignal} [signal]
   * @returns {Promise<{schools: Array<{id: string, code: string, nameAr: string, nameEn: string|null, isActive: boolean}>}>}
   */
  async listSchools(signal = null) {
    const res = await apiClient('/schools', { method: 'GET', signal });
    return res.data;
  }
};
