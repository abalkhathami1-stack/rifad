/**
 * Arabic Data Normalizer
 * Provides high-precision normalization for Arabic names, Saudi phone numbers,
 * National/Parent IDs, and emails, preserving raw values alongside normalized versions.
 */
class ArabicDataNormalizer {
  /**
   * Normalizes Arabic names for comparison and duplicate detection.
   * Strips tashkeel, tatweel, unifies hamzas, taa marbouta, and alef maqsoura.
   */
  static normalizeArabicName(name) {
    if (!name || typeof name !== 'string') return '';

    let clean = name.trim();

    // 1. Remove Tashkeel (diacritics) & Quranic marks
    clean = clean.replace(/[\u064B-\u065F\u0670]/g, '');

    // 2. Remove Tatweel (Kashida)
    clean = clean.replace(/\u0640/g, '');

    // 3. Unify Alef & Hamzas (أ, إ, آ, ٱ -> ا)
    clean = clean.replace(/[إأآٱ]/g, 'ا');

    // 4. Unify Alef Maqsoura (ى -> ي)
    clean = clean.replace(/ى/g, 'ي');

    // 5. Unify Taa Marbouta (ة -> ه)
    clean = clean.replace(/ة/g, 'ه');

    // 6. Collapse multiple spaces into single space
    clean = clean.replace(/\s+/g, ' ').trim();

    return clean;
  }

  /**
   * Generates a strict comparison signature for family/parent names
   * by removing noise words ('ابن', 'بن', 'بنت', 'آل', 'ال' at word starts).
   */
  static generateNameComparisonSignature(name) {
    const normalized = this.normalizeArabicName(name);
    if (!normalized) return '';

    const words = normalized.split(/\s+/);
    const noiseWords = new Set(['بن', 'ابن', 'بنت', 'ال', 'الـ']);

    const cleanedWords = words
      .filter(w => !noiseWords.has(w))
      .map(w => {
        // Strip leading 'ال' if word is longer than 3 letters (e.g. 'الغامدي' -> 'غامدي', 'الشيخ' -> 'شيخ')
        if (w.startsWith('ال') && w.length > 3) {
          return w.slice(2);
        }
        return w;
      });

    return cleanedWords.join(' ');
  }

  /**
   * Normalizes Saudi mobile numbers to international 9665xxxxxxxx standard format.
   * Supports: 05xxxxxxxx, +9665xxxxxxxx, 009665xxxxxxxx, 9665xxxxxxxx, 5xxxxxxxx.
   */
  static normalizeSaudiPhone(phone) {
    if (!phone) return { raw: '', normalized: '', isValid: false };

    const rawStr = String(phone).trim();
    let digits = rawStr.replace(/[^\d+]/g, '');

    // Remove leading + or 00
    if (digits.startsWith('+')) digits = digits.slice(1);
    if (digits.startsWith('00')) digits = digits.slice(2);

    // If starts with 05 (10 digits) -> 9665...
    if (digits.startsWith('05') && digits.length === 10) {
      digits = '966' + digits.slice(1);
    }
    // If starts with 5 (9 digits) -> 9665...
    else if (digits.startsWith('5') && digits.length === 9) {
      digits = '966' + digits;
    }

    const isValid = /^9665\d{8}$/.test(digits);

    return {
      raw: rawStr,
      normalized: isValid ? digits : digits,
      isValid
    };
  }

  /**
   * Normalizes National ID or Parent ID (Saudi National ID or Iqama).
   * Strips non-digits, checks for 10-digit length.
   */
  static normalizeIdNumber(idVal) {
    if (!idVal) return { raw: '', normalized: '', isValid: false };

    const rawStr = String(idVal).trim();
    const digits = rawStr.replace(/\D/g, '');
    const isValid = /^\d{10}$/.test(digits);

    return {
      raw: rawStr,
      normalized: digits,
      isValid
    };
  }

  /**
   * Normalizes email address (lowercase, trim).
   */
  static normalizeEmail(email) {
    if (!email) return { raw: '', normalized: '', isValid: true };

    const rawStr = String(email).trim();
    const clean = rawStr.toLowerCase();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);

    return {
      raw: rawStr,
      normalized: clean,
      isValid
    };
  }

  /**
   * Processes a full student + parent record row, generating both raw and normalized representations.
   */
  static processRow(rawRecord) {
    const rawStudentName = String(rawRecord.studentName || rawRecord.student_name || '').trim();
    const rawStudentNameEn = rawRecord.studentNameEn ? String(rawRecord.studentNameEn).trim() : null;
    const rawGrade = String(rawRecord.grade || rawRecord.grade_name || '').trim();
    const rawSection = String(rawRecord.section || rawRecord.class_section || '').trim();
    const rawStage = rawRecord.stage ? String(rawRecord.stage).trim() : null;

    const rawParentId = String(rawRecord.parentId || rawRecord.parent_id || '').trim();
    const rawParentName = String(rawRecord.parentName || rawRecord.parent_name || '').trim();
    const rawParentPhone = String(rawRecord.parentPhone || rawRecord.parent_phone || '').trim();
    const rawParentEmail = rawRecord.parentEmail ? String(rawRecord.parentEmail).trim() : null;

    const phoneResult = this.normalizeSaudiPhone(rawParentPhone);
    const parentIdResult = this.normalizeIdNumber(rawParentId);
    const emailResult = this.normalizeEmail(rawParentEmail);

    const normalizedParentName = this.normalizeArabicName(rawParentName);
    const parentComparisonSignature = this.generateNameComparisonSignature(rawParentName);

    const normalizedStudentName = this.normalizeArabicName(rawStudentName);

    return {
      student: {
        raw: {
          name: rawStudentName,
          nameEn: rawStudentNameEn,
          grade: rawGrade,
          section: rawSection,
          stage: rawStage
        },
        normalized: {
          name: normalizedStudentName,
          nameEn: rawStudentNameEn ? rawStudentNameEn.toLowerCase() : null,
          grade: rawGrade,
          section: rawSection,
          stage: rawStage
        }
      },
      parent: {
        raw: {
          id: rawParentId,
          name: rawParentName,
          phone: rawParentPhone,
          email: rawParentEmail
        },
        normalized: {
          id: parentIdResult.normalized,
          name: normalizedParentName,
          signature: parentComparisonSignature,
          phone: phoneResult.normalized,
          email: emailResult.normalized
        },
        validation: {
          isPhoneValid: phoneResult.isValid,
          isIdValid: parentIdResult.isValid,
          isEmailValid: emailResult.isValid
        }
      }
    };
  }
}

module.exports = ArabicDataNormalizer;
