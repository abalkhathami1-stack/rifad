import { apiClient } from './client';

/**
 * Guardians API Service
 * Centralized API client methods for Guardians Domain
 */
export const GuardiansApi = {
  /**
   * Retrieves paginated list of guardians with optional search and filters.
   * 
   * @param {Object} params - Query parameters
   * @param {string} [params.query] - Search query for guardian name, phone, or national ID
   * @param {string} [params.status] - Filter by status (ACTIVE, INACTIVE, SUSPENDED)
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {number} [params.page=1] - Page number (1-indexed)
   * @param {number} [params.limit=20] - Number of items per page
   * @param {AbortSignal} [signal] - Optional AbortSignal for race-condition cancellation
   */
  async listGuardians(params = {}, signal = null) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/guardians?${queryString}` : '/guardians';

    const res = await apiClient(endpoint, {
      method: 'GET',
      signal
    });

    return res.data;
  },

  /**
   * Retrieves single guardian full details by ID including student relationships.
   * 
   * @param {string} id - Guardian UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async getGuardianById(id, signal = null) {
    if (!id) {
      throw new Error('معرف ولي الأمر مطلوب');
    }

    const res = await apiClient(`/guardians/${encodeURIComponent(id)}`, {
      method: 'GET',
      signal
    });

    return res.data;
  }
};
