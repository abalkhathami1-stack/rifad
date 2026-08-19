import { apiClient } from './client';

/**
 * Promotion & Rollover API Service
 * Centralized client for Promotion Domain
 */
export const PromotionApi = {
  /**
   * Retrieves paginated list of promotion batches.
   * 
   * @param {Object} [params]
   * @param {string} [params.status] - Filter by status ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'CANCELLED')
   * @param {number} [params.page=1]
   * @param {number} [params.limit=20]
   * @param {AbortSignal} [signal]
   */
  async listBatches(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    const endpoint = qs ? `/promotion/batches?${qs}` : '/promotion/batches';
    const res = await apiClient(endpoint, { method: 'GET', signal });
    return res.data;
  },

  /**
   * Creates a new promotion batch in DRAFT status.
   * 
   * @param {Object} data
   * @param {string} data.sourceAcademicYearId - Source Academic Year UUID
   * @param {string} data.targetAcademicYearId - Target Academic Year UUID
   * @param {string} [data.notes] - Optional notes
   * @param {AbortSignal} [signal]
   */
  async createBatch(data, signal = null) {
    const res = await apiClient('/promotion/batches', {
      method: 'POST',
      body: data,
      signal
    });
    return res.data;
  },

  /**
   * Retrieves single batch details by UUID.
   * 
   * @param {string} batchId
   * @param {Object} [params]
   * @param {boolean} [params.includeItems=true]
   * @param {AbortSignal} [signal]
   */
  async getBatchById(batchId, params = { includeItems: true }, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الترفيع مطلوب');
    const searchParams = new URLSearchParams();
    if (params.includeItems !== undefined) {
      searchParams.append('includeItems', String(params.includeItems));
    }
    const qs = searchParams.toString();
    const endpoint = qs ? `/promotion/batches/${encodeURIComponent(batchId)}?${qs}` : `/promotion/batches/${encodeURIComponent(batchId)}`;
    const res = await apiClient(endpoint, { method: 'GET', signal });
    return res.data;
  },

  /**
   * Generates promotion decisions for all active students enrolled in source academic year.
   * 
   * @param {string} batchId
   * @param {AbortSignal} [signal]
   */
  async generateBatchItems(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الترفيع مطلوب');
    const res = await apiClient(`/promotion/batches/${encodeURIComponent(batchId)}/generate`, {
      method: 'POST',
      signal
    });
    return res.data;
  },

  /**
   * Updates an individual student promotion decision (Manual Override).
   * 
   * @param {string} itemId - PromotionBatchItem UUID
   * @param {Object} data
   * @param {'PROMOTE' | 'RETAIN' | 'GRADUATE' | 'LEAVE'} [data.finalAction]
   * @param {string} [data.toClassSectionId]
   * @param {string} [data.overrideReason]
   * @param {AbortSignal} [signal]
   */
  async updateBatchItem(itemId, data, signal = null) {
    if (!itemId) throw new Error('معرف عنصر الترفيع مطلوب');
    const res = await apiClient(`/promotion/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: data,
      signal
    });
    return res.data;
  },

  /**
   * Updates batch status (e.g. DRAFT <-> UNDER_REVIEW <-> CANCELLED).
   * 
   * @param {string} batchId
   * @param {'DRAFT' | 'UNDER_REVIEW' | 'CANCELLED'} status
   * @param {AbortSignal} [signal]
   */
  async updateBatchStatus(batchId, status, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الترفيع مطلوب');
    const res = await apiClient(`/promotion/batches/${encodeURIComponent(batchId)}/status`, {
      method: 'PATCH',
      body: { status },
      signal
    });
    return res.data;
  },

  /**
   * Atomically executes and approves the promotion rollover batch.
   * 
   * @param {string} batchId
   * @param {AbortSignal} [signal]
   */
  async approveBatch(batchId, signal = null) {
    if (!batchId) throw new Error('معرف دفعة الترفيع مطلوب');
    const res = await apiClient(`/promotion/batches/${encodeURIComponent(batchId)}/approve`, {
      method: 'POST',
      signal
    });
    return res.data;
  }
};
