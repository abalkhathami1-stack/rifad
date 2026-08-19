/**
 * Promotion Domain Statuses & Enums Mapping
 * Strictly maps to PromotionBatchStatus and PromotionAction enums from schema.prisma
 */

export const PROMOTION_BATCH_STATUS_LABELS = {
  DRAFT: 'مسودة',
  UNDER_REVIEW: 'قيد المراجعة والتدقيق',
  APPROVED: 'معتمدة ومرحّلة',
  CANCELLED: 'ملغاة'
};

export const PROMOTION_ACTION_LABELS = {
  PROMOTE: 'ترقية للصف الأعلى',
  RETAIN: 'إعادة القيد بالصف',
  GRADUATE: 'تخرج',
  LEAVE: 'مغادرة / انسحاب'
};

export function formatPromotionBatchStatus(status) {
  if (!status) return 'غير محدد';
  return PROMOTION_BATCH_STATUS_LABELS[status] || status;
}

export function formatPromotionAction(action) {
  if (!action) return 'غير محدد';
  return PROMOTION_ACTION_LABELS[action] || action;
}

export function getPromotionStatusBadgeClass(status) {
  switch (status) {
    case 'APPROVED':
      return 'badge-success';
    case 'UNDER_REVIEW':
      return 'badge-warning';
    case 'DRAFT':
      return 'badge-primary';
    case 'CANCELLED':
      return 'badge-error';
    default:
      return 'badge-primary';
  }
}

export function getPromotionActionBadgeClass(action) {
  switch (action) {
    case 'PROMOTE':
      return 'badge-success';
    case 'RETAIN':
      return 'badge-warning';
    case 'GRADUATE':
      return 'badge-primary';
    case 'LEAVE':
      return 'badge-error';
    default:
      return 'badge-primary';
  }
}
