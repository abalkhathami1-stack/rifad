/**
 * Student & Parent Validator
 * Performs multi-layer validation on normalized student and parent rows against
 * business rules and school academic reference structures.
 */
class StudentValidator {
  /**
   * Validates a normalized row object.
   * @param {Object} rowObj - output of ArabicDataNormalizer.processRow
   * @param {number} rowNumber - Excel/CSV row number
   * @param {Object} [schoolContext] - Optional valid grades, classes, stages maps from DB
   * @returns {Array<Object>} list of validation errors for this row
   */
  static validateRow(rowObj, rowNumber, schoolContext = {}) {
    const errors = [];
    const { student, parent } = rowObj;

    // 1. Student Name Check
    if (!student.raw.name) {
      errors.push({
        rowNumber,
        fieldName: 'studentName',
        errorCode: 'MISSING_STUDENT_NAME',
        errorMessageAr: 'اسم الطالب حقل إلزامي لا يمكن تركه فارغاً'
      });
    } else if (student.normalized.name.length < 3) {
      errors.push({
        rowNumber,
        fieldName: 'studentName',
        errorCode: 'INVALID_STUDENT_NAME',
        errorMessageAr: 'اسم الطالب قصير جداً وغير مكتمل'
      });
    }

    // 2. Grade Check
    if (!student.raw.grade) {
      errors.push({
        rowNumber,
        fieldName: 'grade',
        errorCode: 'MISSING_GRADE',
        errorMessageAr: 'الصف الدراسي حقل إلزامي'
      });
    } else if (schoolContext.gradesMap && !schoolContext.gradesMap.has(student.raw.grade) && !schoolContext.gradesMap.has(student.normalized.grade)) {
      errors.push({
        rowNumber,
        fieldName: 'grade',
        errorCode: 'INVALID_GRADE_REFERENCE',
        errorMessageAr: `الصف الدراسي [${student.raw.grade}] غير مسجل في الهيكل الأكاديمي للمدرسة`
      });
    }

    // 3. Section Check
    if (!student.raw.section) {
      errors.push({
        rowNumber,
        fieldName: 'section',
        errorCode: 'MISSING_SECTION',
        errorMessageAr: 'الشعبة / الفصل حقل إلزامي'
      });
    } else if (schoolContext.classesMap && !schoolContext.classesMap.has(student.raw.section) && !schoolContext.classesMap.has(student.normalized.section)) {
      errors.push({
        rowNumber,
        fieldName: 'section',
        errorCode: 'INVALID_SECTION_REFERENCE',
        errorMessageAr: `الشعبة / الفصل [${student.raw.section}] غير مسجلة في المدرسة`
      });
    }

    // 4-7. Guardian Fields — delegated to validateGuardianFields(), the single
    // source of truth for guardian rules (RIFAD-GAP-011 Phase 0D.1). Shared,
    // unchanged in behavior/order, by both this legacy validateRow() caller and
    // the live ImportService.validateBatch path.
    errors.push(...this.validateGuardianFields(parent, rowNumber));

    return errors;
  }

  /**
   * Validates the guardian (parent) portion of a normalized row in isolation.
   * SINGLE SOURCE OF TRUTH for guardian field rules (RIFAD-GAP-011 Phase 0D.1) —
   * called both by validateRow() above and directly by the live
   * ImportService.validateBatch STUDENTS path.
   * @param {Object} parent - normalized parent object, i.e. the `.parent`
   *   property of ArabicDataNormalizer.processRow(...)'s return value.
   * @param {number} rowNumber - Excel/CSV row number, for error reporting.
   * @returns {Array<Object>} guardian-only validation errors for this row.
   */
  static validateGuardianFields(parent, rowNumber) {
    const errors = [];

    // 4. Parent ID Check
    if (!parent.raw.id) {
      errors.push({
        rowNumber,
        fieldName: 'parentId',
        errorCode: 'MISSING_PARENT_ID',
        errorMessageAr: 'رقم هوية ولي الأمر حقل إلزامي'
      });
    } else if (!parent.validation.isIdValid) {
      errors.push({
        rowNumber,
        fieldName: 'parentId',
        errorCode: 'INVALID_PARENT_ID_FORMAT',
        errorMessageAr: `رقم هوية ولي الأمر [${parent.raw.id}] غير صالح (يجب أن يتكون من 10 أرقام)`
      });
    }

    // 5. Parent Name Check
    if (!parent.raw.name) {
      errors.push({
        rowNumber,
        fieldName: 'parentName',
        errorCode: 'MISSING_PARENT_NAME',
        errorMessageAr: 'اسم ولي الأمر حقل إلزامي'
      });
    } else if (parent.normalized.name.length < 3) {
      errors.push({
        rowNumber,
        fieldName: 'parentName',
        errorCode: 'INVALID_PARENT_NAME',
        errorMessageAr: 'اسم ولي الأمر قصير جداً وغير مكتمل'
      });
    }

    // 6. Parent Phone Check
    if (!parent.raw.phone) {
      errors.push({
        rowNumber,
        fieldName: 'parentPhone',
        errorCode: 'MISSING_PARENT_PHONE',
        errorMessageAr: 'رقم جوال ولي الأمر حقل إلزامي'
      });
    } else if (!parent.validation.isPhoneValid) {
      errors.push({
        rowNumber,
        fieldName: 'parentPhone',
        errorCode: 'INVALID_SAUDI_PHONE_FORMAT',
        errorMessageAr: `رقم جوال ولي الأمر [${parent.raw.phone}] غير صالح (يجب أن يكون رقم جوال سعودي صحيح 05xxxxxxxx)`
      });
    }

    // 7. Parent Email Check (Optional)
    if (parent.raw.email && !parent.validation.isEmailValid) {
      errors.push({
        rowNumber,
        fieldName: 'parentEmail',
        errorCode: 'INVALID_EMAIL_FORMAT',
        errorMessageAr: `البريد الإلكتروني لولي الأمر [${parent.raw.email}] غير صالح`
      });
    }

    return errors;
  }
}

module.exports = StudentValidator;
