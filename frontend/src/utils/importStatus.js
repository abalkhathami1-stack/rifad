/**
 * Import Domain Statuses & Utilities
 * Strict mapping to ImportBatchStatus and ImportRecordStatus Enums in schema.prisma
 */

export const IMPORT_BATCH_STATUS_LABELS = {
  PENDING: 'قيد الانتظار',
  VALIDATING: 'جارٍ التحقق',
  VALIDATED: 'تم التحقق بنجاح',
  COMMITTED: 'تم الاعتماد والتسكين',
  FAILED: 'توجد أخطاء تحقق',
  CANCELLED: 'ملغاة'
};

export const IMPORT_RECORD_STATUS_LABELS = {
  PENDING: 'قيد الانتظار',
  VALID: 'صالح',
  INVALID: 'غير صالح',
  PROCESSED: 'تمت المعالجة'
};

export function formatBatchStatus(status) {
  if (!status) return 'غير محدد';
  return IMPORT_BATCH_STATUS_LABELS[status] || status;
}

export function getBatchStatusBadgeClass(status) {
  switch (status) {
    case 'COMMITTED':
      return 'badge-success';
    case 'VALIDATED':
      return 'badge-primary';
    case 'VALIDATING':
    case 'PENDING':
      return 'badge-warning';
    case 'FAILED':
    case 'CANCELLED':
      return 'badge-error';
    default:
      return 'badge-primary';
  }
}
