/**
 * Guardian Relationship Labels and Helpers
 * Strict mapping to GuardianRelationshipType Enum in schema.prisma
 */
export const RELATIONSHIP_LABELS = {
  FATHER: 'أب',
  MOTHER: 'أم',
  LEGAL_GUARDIAN: 'ولي أمر شرعي',
  BROTHER: 'أخ',
  SISTER: 'أخت',
  UNCLE: 'عم / خال',
  AUNT: 'عمة / خالة',
  GRANDPARENT: 'جد / جدة',
  OTHER: 'آخر'
};

/**
 * Returns localized Arabic text for a relationship enum value.
 * @param {string} type - Enum value (e.g. 'FATHER', 'MOTHER')
 * @returns {string} Arabic label
 */
export function formatRelationship(type) {
  if (!type) return 'غير محدد';
  return RELATIONSHIP_LABELS[type] || type;
}
