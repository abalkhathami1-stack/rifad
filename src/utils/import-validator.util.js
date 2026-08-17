const AppError = require('./app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');

const REQUIRED_TEMPLATE_HEADERS = {
  STUDENTS: [
    ['first_name_ar', 'family_name_ar', 'grade', 'section'],
    ['full_name_ar', 'grade', 'section'],
    ['student_name', 'grade', 'section'],
    ['student_name', 'parent_id', 'parent_name', 'parent_phone', 'grade', 'section']
  ],
  TEACHERS: [
    ['full_name_ar', 'employee_number', 'specialization'],
    ['first_name_ar', 'family_name_ar', 'employee_number', 'specialization']
  ]
};

const HEADER_ALIASES = {
  // Students
  'first_name_ar': ['first_name_ar', 'firstnamear', 'firstname', 'first_name', 'الاسم_الاول', 'الاسم الاول'],
  'second_name_ar': ['second_name_ar', 'secondnamear', 'secondname', 'second_name', 'اسم_الاب', 'اسم الاب'],
  'third_name_ar': ['third_name_ar', 'thirdnamear', 'thirdname', 'third_name', 'اسم_الجد', 'اسم الجد'],
  'family_name_ar': ['family_name_ar', 'familynamear', 'familyname', 'family_name', 'اسم_العائلة', 'اسم العائلة', 'القبيلة', 'اللقب'],
  'full_name_ar': ['full_name_ar', 'fullnamear', 'fullname', 'full_name', 'الاسم_الكامل', 'الاسم الكامل', 'اسم الطالب الرباعي', 'اسم المعلم'],
  'student_name': ['student_name', 'studentname', 'student_full_name', 'اسم الطالب', 'اسم_الطالب', 'اسم الطالب بالعربي'],
  'student_name_en': ['student_name_en', 'studentnameen', 'full_name_en', 'اسم الطالب بالانجليزي', 'الاسم بالانجليزية', 'الاسم اللاتيني'],
  'grade': ['grade', 'gradename', 'grade_name', 'grade_level', 'gradelevel', 'الصف', 'الصف الدراسي', 'المرحلة والصف'],
  'section': ['section', 'sectionname', 'section_name', 'class_section', 'classsection', 'class', 'الشعبة', 'الفصل', 'الصف والشعبة'],
  'student_code': ['student_code', 'studentcode', 'student_id', 'code', 'كود الطالب', 'رقم الطالب'],
  'status': ['status', 'الحالة', 'حالة الطالب', 'حالة القيد'],
  'gender': ['gender', 'الجنس', 'النوع'],

  // Student Onboarding Parents
  'parent_id': ['parent_id', 'parentid', 'guardian_id', 'guardianid', 'هوية ولي الامر', 'هوية_ولي_الامر', 'هوية ولي الأمر', 'هوية_ولي_الأمر', 'سجل ولي الأمر', 'رقم هوية ولي الأمر', 'هوية الأب'],
  'parent_name': ['parent_name', 'parentname', 'guardian_name', 'guardianname', 'اسم ولي الامر', 'اسم_ولي_الامر', 'اسم ولي الأمر', 'اسم_ولي_الأمر', 'اسم الأب', 'اسم ولي الأمر رباعي'],
  'parent_phone': ['parent_phone', 'parentphone', 'guardian_phone', 'guardianphone', 'جوال ولي الامر', 'جوال_ولي_الامر', 'جوال ولي الأمر', 'جوال_ولي_الأمر', 'رقم جوال ولي الأمر', 'هاتف ولي الأمر', 'جوال الأب'],
  'parent_email': ['parent_email', 'parentemail', 'guardian_email', 'بريد ولي الامر', 'بريد ولي الأمر', 'البريد الإلكتروني لولي الأمر'],

  // Teachers
  'employee_number': ['employee_number', 'employeenumber', 'emp_no', 'empno', 'الرقم_الوظيفي', 'الرقم الوظيفي', 'رقم الموظف'],
  'specialization': ['specialization', 'specialization_code', 'specialization_name', 'spec', 'التخصص', 'تخصص المعلم', 'المادة الرئيسية'],
  'national_id': ['national_id', 'nationalid', 'id_number', 'الهوية', 'الهوية الوطنية', 'رقم الهوية', 'السجل المدني'],
  'phone': ['phone', 'phonenumber', 'mobile', 'الجوال', 'رقم الجوال', 'الهاتف'],
  'email': ['email', 'email_address', 'البريد', 'البريد الالكتروني', 'البريد الإلكتروني']
};

class ImportValidatorUtil {
  /**
   * Normalizes raw header keys to canonical schema field names.
   */
  static normalizeHeaders(rawRow) {
    const normalized = {};
    const keys = Object.keys(rawRow);

    for (const rawKey of keys) {
      const cleanKey = rawKey.trim().toLowerCase().replace(/[\s_-]+/g, '_');
      let matchedCanonical = null;

      for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.some(alias => alias.toLowerCase().replace(/[\s_-]+/g, '_') === cleanKey)) {
          matchedCanonical = canonical;
          break;
        }
      }

      if (matchedCanonical) {
        normalized[matchedCanonical] = typeof rawRow[rawKey] === 'string' ? rawRow[rawKey].trim() : rawRow[rawKey];
      } else {
        normalized[cleanKey] = typeof rawRow[rawKey] === 'string' ? rawRow[rawKey].trim() : rawRow[rawKey];
      }
    }

    return normalized;
  }

  /**
   * Validates that the parsed rows contain at least one valid set of required template headers.
   */
  static validateTemplateHeaders(entityType, normalizedRows) {
    if (!normalizedRows || normalizedRows.length === 0) {
      throw new AppError('الملف فارغ ولا يحتوي على أي صفوف بيانات', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const upperEntity = entityType.toUpperCase();
    const allowedSets = REQUIRED_TEMPLATE_HEADERS[upperEntity];

    if (!allowedSets) {
      throw new AppError(`نوع الكيان [${entityType}] غير مدعوم للاستيراد`, 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const firstRowKeys = new Set(Object.keys(normalizedRows[0]));

    const matchesAnySet = allowedSets.some(requiredSet =>
      requiredSet.every(field => firstRowKeys.has(field))
    );

    if (!matchesAnySet) {
      const requiredOptionsText = allowedSets
        .map(set => `(${set.join(', ')})`)
        .join(' أو ');
      throw new AppError(
        `الملف المرفوع يفتقر إلى الأعمدة الإلزامية المطلوبة لقالب [${upperEntity}]. الأعمدة المطلوبة: ${requiredOptionsText}`,
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    return true;
  }
}

module.exports = ImportValidatorUtil;
