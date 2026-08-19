import { apiClient } from './client';

/**
 * Academic Structure API Service
 * Centralized API client methods for Academic Domain
 */
export const AcademicApi = {
  /**
   * Retrieves list of academic years including their terms.
   * 
   * @param {Object} [params] - Query parameters
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listYears(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const res = await apiClient(qs ? `/academic/years?${qs}` : '/academic/years', { method: 'GET', signal });
    return res.data;
  },

  /**
   * Retrieves terms for a specific academic year.
   * 
   * @param {string} yearId - Academic Year UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listTerms(yearId, signal = null) {
    if (!yearId) throw new Error('معرف السنة الدراسية مطلوب');
    const res = await apiClient(`/academic/years/${encodeURIComponent(yearId)}/terms`, { method: 'GET', signal });
    return res.data;
  },

  /**
   * Retrieves list of educational stages including their grades.
   * 
   * @param {Object} [params] - Query parameters
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listStages(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const res = await apiClient(qs ? `/academic/stages?${qs}` : '/academic/stages', { method: 'GET', signal });
    return res.data;
  },

  /**
   * Retrieves list of grades with optional stage filter.
   * 
   * @param {Object} [params] - Query parameters
   * @param {string} [params.stageId] - Filter by stage UUID
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listGrades(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const res = await apiClient(qs ? `/academic/grades?${qs}` : '/academic/grades', { method: 'GET', signal });
    return res.data;
  },

  /**
   * Retrieves list of class sections with optional filters.
   * 
   * @param {Object} [params] - Query parameters
   * @param {string} [params.academicYearId] - Filter by Academic Year UUID
   * @param {string} [params.gradeId] - Filter by Grade UUID
   * @param {string} [params.sectionDivisionId] - Filter by Section Division UUID
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listClassSections(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const res = await apiClient(qs ? `/academic/classes?${qs}` : '/academic/classes', { method: 'GET', signal });
    return res.data;
  },

  /**
   * Retrieves list of subjects.
   * 
   * @param {Object} [params] - Query parameters
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listSubjects(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const res = await apiClient(qs ? `/academic/subjects?${qs}` : '/academic/subjects', { method: 'GET', signal });
    return res.data;
  },

  /**
   * Retrieves list of school sections (divisions e.g. Boys / Girls).
   * 
   * @param {Object} [params] - Query parameters
   * @param {string} [params.schoolId] - Explicit school scope UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listSections(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const res = await apiClient(qs ? `/academic/sections?${qs}` : '/academic/sections', { method: 'GET', signal });
    return res.data;
  }
};
