import { apiClient } from './client';

/**
 * Import API Service
 * Centralized API client methods for Import Engine Domain
 */
export const ImportApi = {
  /**
   * Creates a new import batch in PENDING status.
   * 
   * @param {Object} data - Payload
   * @param {string} data.entityType - 'STUDENTS' | 'TEACHERS'
   * @param {string} [data.originalFileName] - Original filename
   * @param {string} [data.schoolId] - Explicit school scope
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async createBatch(data, signal = null) {
    const res = await apiClient('/import/batches', {
      method: 'POST',
      body: data,
      signal
    });
    return res.data;
  },

  /**
   * Uploads an Excel or CSV file to a staged import batch.
   * 
   * @param {string} batchId - Batch UUID
   * @param {File} file - File instance from input[type=file]
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async uploadFile(batchId, file, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الاستيراد مطلوب');
    if (!file) throw new Error('يرجى اختيار ملف للرفع');

    const formData = new FormData();
    formData.append('file', file);

    const res = await apiClient(`/import/batches/${encodeURIComponent(batchId)}/upload`, {
      method: 'POST',
      body: formData,
      signal
    });
    return res.data;
  },

  /**
   * Triggers synchronous server-side validation on a staged import batch.
   * 
   * @param {string} batchId - Batch UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async validateBatch(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الاستيراد مطلوب');
    const res = await apiClient(`/import/batches/${encodeURIComponent(batchId)}/validate`, {
      method: 'POST',
      signal
    });
    return res.data;
  },

  /**
   * Retrieves preview records, summary statistics, and validation errors for a batch.
   * 
   * @param {string} batchId - Batch UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async getBatchPreview(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الاستيراد مطلوب');
    const res = await apiClient(`/import/batches/${encodeURIComponent(batchId)}/preview`, {
      method: 'GET',
      signal
    });
    return res.data;
  },

  /**
   * Retrieves validation errors for a batch.
   * 
   * @param {string} batchId - Batch UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async getBatchErrors(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الاستيراد مطلوب');
    const res = await apiClient(`/import/batches/${encodeURIComponent(batchId)}/errors`, {
      method: 'GET',
      signal
    });
    return res.data;
  },

  /**
   * Retrieves single batch details.
   * 
   * @param {string} batchId - Batch UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async getBatchById(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الاستيراد مطلوب');
    const res = await apiClient(`/import/batches/${encodeURIComponent(batchId)}`, {
      method: 'GET',
      signal
    });
    return res.data;
  },

  /**
   * Retrieves paginated list of historical import batches.
   * 
   * @param {Object} [params] - Query parameters
   * @param {string} [params.status] - Filter by status
   * @param {string} [params.entityType] - Filter by entityType
   * @param {number} [params.page=1] - Page number
   * @param {number} [params.limit=10] - Items per page
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async listBatches(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const endpoint = qs ? `/import/batches?${qs}` : '/import/batches';
    const res = await apiClient(endpoint, { method: 'GET', signal });
    return res.data;
  },

  /**
   * Atomically commits a student onboarding batch to operational tables (Students, Guardians, Enrollments).
   * 
   * @param {string} batchId - Batch UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async commitStudentOnboardingBatch(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الاستيراد مطلوب');
    const res = await apiClient(`/import/batches/${encodeURIComponent(batchId)}/commit-onboarding`, {
      method: 'POST',
      signal
    });
    return res.data;
  },

  /**
   * Generic commit for standard batches.
   * 
   * @param {string} batchId - Batch UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async commitBatch(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الاستيراد مطلوب');
    const res = await apiClient(`/import/batches/${encodeURIComponent(batchId)}/commit`, {
      method: 'POST',
      signal
    });
    return res.data;
  },

  /**
   * Cancels a pending or failed import batch.
   * 
   * @param {string} batchId - Batch UUID
   * @param {AbortSignal} [signal] - Optional AbortSignal
   */
  async cancelBatch(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الاستيراد مطلوب');
    const res = await apiClient(`/import/batches/${encodeURIComponent(batchId)}/cancel`, {
      method: 'PATCH',
      signal
    });
    return res.data;
  }
};
