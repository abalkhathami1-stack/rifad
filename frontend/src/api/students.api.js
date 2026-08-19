import { apiClient } from './client';

/**
 * Students API Service
 * Centralized API client methods for Students Domain
 */
export const StudentsApi = {
  /**
   * Retrieves paginated list of students with optional search and filters.
   * 
   * @param {Object} params - Query parameters
   * @param {string} [params.search] - Search text for name, code, or national ID
   * @param {string} [params.status] - Filter by student status (ACTIVE, SUSPENDED, etc.)
   * @param {string} [params.gradeId] - Filter by Grade UUID
   * @param {string} [params.classSectionId] - Filter by Class Section UUID
   * @param {string} [params.academicYearId] - Filter by Academic Year UUID
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {number} [params.page=1] - Page number (1-indexed)
   * @param {number} [params.limit=20] - Number of items per page
   * @param {AbortSignal} [signal] - Optional AbortSignal for race-condition cancellation
   */
  async listStudents(params = {}, signal = null) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/students?${queryString}` : '/students';

    const res = await apiClient(endpoint, {
      method: 'GET',
      signal
    });

    return res.data;
  },

  /**
   * Retrieves single student full details by ID including current and historical enrollments.
   * 
   * @param {string} id - Student UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async getStudentById(id, signal = null) {
    if (!id) {
      throw new Error('معرف الطالب مطلوب');
    }

    const res = await apiClient(`/students/${encodeURIComponent(id)}`, {
      method: 'GET',
      signal
    });

    return res.data;
  }
};
