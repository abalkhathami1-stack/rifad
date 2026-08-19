/**
 * Centralized Fetch API Client for RIFAD
 * 
 * Features:
 * - Automatically injects `credentials: 'include'` for HttpOnly session cookie transmission.
 * - Handles JSON payload serialization and unified response envelopes.
 * - Sanitizes errors and returns user-friendly messages without exposing server internals.
 * - Zero localStorage/sessionStorage token usage.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiClient(endpoint, { method = 'GET', body = null, headers = {}, ...customConfig } = {}) {
  const config = {
    method,
    headers: {
      'Accept': 'application/json',
      ...headers
    },
    credentials: 'include', // Crucial for sending/receiving HttpOnly cookies
    ...customConfig
  };

  if (body) {
    if (!(body instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    } else {
      config.body = body; // Let browser handle multipart/form-data boundary
    }
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  let response;
  try {
    response = await fetch(url, config);
  } catch (netErr) {
    throw new ApiError('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الشبكة.', 0, 'NETWORK_ERROR');
  }

  // Parse JSON response
  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMessage = data?.error?.message || data?.message || getDefaultErrorMessage(response.status);
    const errorCode = data?.error?.code || 'HTTP_ERROR';
    throw new ApiError(errorMessage, response.status, errorCode);
  }

  return data;
}

function getDefaultErrorMessage(status) {
  switch (status) {
    case 400:
      return 'بيانات الطلب غير صالحة. يرجى التحقق من المدخلات.';
    case 401:
      return 'انتهت الجلسة أو اسم المستخدم/كلمة المرور غير صحيحة.';
    case 403:
      return 'ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء.';
    case 404:
      return 'العنصر المطلوب غير موجود على الخادم.';
    case 409:
      return 'يوجد تعارض في البيانات المدخلة.';
    case 429:
      return 'تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار قليلاً.';
    case 500:
    default:
      return 'حدث خطأ في معالجة الطلب على الخادم. يرجى المحاولة لاحقاً.';
  }
}
