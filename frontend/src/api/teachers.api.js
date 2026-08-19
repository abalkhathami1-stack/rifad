import { apiClient } from './client';

/**
 * Teachers API Service
 * Centralized API client methods for Teachers Domain
 */
export const TeachersApi = {
  /**
   * Retrieves paginated list of teachers with optional search and filters.
   * 
   * @param {Object} params - Query parameters
   * @param {string} [params.search] - Search text for name or employee number
   * @param {string} [params.status] - Filter by teacher status (ACTIVE, ON_LEAVE, RESIGNED, TERMINATED)
   * @param {string} [params.specializationId] - Filter by Specialization UUID
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {number} [params.page=1] - Page number (1-indexed)
   * @param {number} [params.limit=20] - Number of items per page
   * @param {AbortSignal} [signal] - Optional AbortSignal for race-condition cancellation
   */
  async listTeachers(params = {}, signal = null) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/teachers?${queryString}` : '/teachers';

    const res = await apiClient(endpoint, {
      method: 'GET',
      signal
    });

    return res.data;
  },

  /**
   * Retrieves single teacher full details by ID including specializations, qualified subjects, and teaching assignments.
   * 
   * @param {string} id - Teacher UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async getTeacherById(id, signal = null) {
    if (!id) {
      throw new Error('معرف المعلم مطلوب');
    }

    const res = await apiClient(`/teachers/${encodeURIComponent(id)}`, {
      method: 'GET',
      signal
    });

    return res.data;
  },

  /**
   * Retrieves list of academic specializations for filter dropdowns.
   * 
   * @param {string} [schoolId] - Optional school UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listSpecializations(schoolId = null, signal = null) {
    const endpoint = schoolId ? `/teachers/specializations?schoolId=${encodeURIComponent(schoolId)}` : '/teachers/specializations';
    const res = await apiClient(endpoint, {
      method: 'GET',
      signal
    });

    return res.data;
  }
};
