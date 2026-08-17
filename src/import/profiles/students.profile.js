/**
 * Student Import Profile Definition
 * Defines column mapping, aliases, and requirements for student & parent onboarding.
 */
const StudentImportProfile = {
  profileName: 'STUDENT_ONBOARDING_V1',
  entityType: 'STUDENTS',
  supportedFormats: ['.xlsx', '.xls', '.csv'],

  columns: {
    // ------------------------------------
    // Student Information
    // ------------------------------------
    studentName: {
      key: 'studentName',
      labelAr: 'اسم الطالب',
      required: true,
      aliases: [
        'اسم الطالب',
        'اسم الطالب رباعي',
        'الاسم الكامل',
        'اسم الطالب بالعربي',
        'student_name',
        'student_full_name',
        'student_name_ar',
        'full_name_ar',
        'fullname',
        'name'
      ]
    },
    studentNameEn: {
      key: 'studentNameEn',
      labelAr: 'الاسم بالإنجليزية',
      required: false,
      aliases: [
        'الاسم بالإنجليزية',
        'اسم الطالب بالانجليزي',
        'الاسم اللاتيني',
        'student_name_en',
        'full_name_en',
        'english_name'
      ]
    },
    grade: {
      key: 'grade',
      labelAr: 'الصف الدراسي',
      required: true,
      aliases: [
        'الصف',
        'الصف الدراسي',
        'اسم الصف',
        'المرحلة والصف',
        'grade',
        'grade_name',
        'class_grade',
        'grade_level'
      ]
    },
    section: {
      key: 'section',
      labelAr: 'الشعبة / الفصل',
      required: true,
      aliases: [
        'الفصل',
        'الشعبة',
        'اسم الشعبة',
        'القسم الصفي',
        'section',
        'class_section',
        'class_name',
        'division'
      ]
    },
    stage: {
      key: 'stage',
      labelAr: 'المرحلة التعليمية',
      required: false,
      aliases: [
        'المرحلة',
        'المرحلة التعليمية',
        'المرحلة الدراسية',
        'stage',
        'educational_stage',
        'stage_name'
      ]
    },

    // ------------------------------------
    // Parent / Guardian Information
    // ------------------------------------
    parentId: {
      key: 'parentId',
      labelAr: 'رقم هوية ولي الأمر',
      required: true,
      aliases: [
        'رقم هوية ولي الأمر',
        'هوية ولي الأمر',
        'سجل ولي الأمر',
        'السجل المدني لولي الأمر',
        'هوية الأب',
        'سجل الأب',
        'parent_id',
        'guardian_id',
        'parent_national_id',
        'guardian_national_id',
        'parent_nin'
      ]
    },
    parentName: {
      key: 'parentName',
      labelAr: 'اسم ولي الأمر',
      required: true,
      aliases: [
        'اسم ولي الأمر',
        'اسم الأب',
        'ولي الأمر',
        'اسم ولي الأمر رباعي',
        'parent_name',
        'guardian_name',
        'parent_full_name',
        'guardian_full_name'
      ]
    },
    parentPhone: {
      key: 'parentPhone',
      labelAr: 'جوال ولي الأمر',
      required: true,
      aliases: [
        'جوال ولي الأمر',
        'رقم جوال ولي الأمر',
        'هاتف ولي الأمر',
        'جوال الأب',
        'رقم الجوال',
        'الجوال',
        'parent_phone',
        'guardian_phone',
        'mobile',
        'parent_mobile',
        'phone_number',
        'phone'
      ]
    },
    parentEmail: {
      key: 'parentEmail',
      labelAr: 'البريد الإلكتروني لولي الأمر',
      required: false,
      aliases: [
        'بريد ولي الأمر',
        'البريد الإلكتروني',
        'إيميل ولي الأمر',
        'البريد',
        'parent_email',
        'guardian_email',
        'email',
        'email_address'
      ]
    }
  },

  /**
   * Matches raw headers from a file to canonical keys based on aliases.
   */
  resolveHeaders(rawHeaders) {
    const mapping = {};
    const missingRequired = [];
    const normalizedRawHeaders = rawHeaders.map(h => ({
      original: h,
      clean: String(h || '').trim().toLowerCase().replace(/[\s_\-]+/g, '')
    }));

    for (const [canonicalKey, config] of Object.entries(this.columns)) {
      let matchedHeader = null;

      for (const alias of config.aliases) {
        const cleanAlias = alias.trim().toLowerCase().replace(/[\s_\-]+/g, '');
        const found = normalizedRawHeaders.find(h => h.clean === cleanAlias);
        if (found) {
          matchedHeader = found.original;
          break;
        }
      }

      if (matchedHeader) {
        mapping[canonicalKey] = matchedHeader;
      } else if (config.required) {
        missingRequired.push({
          key: canonicalKey,
          labelAr: config.labelAr,
          expectedAliases: config.aliases.slice(0, 4)
        });
      }
    }

    return {
      mapping,
      isValid: missingRequired.length === 0,
      missingRequired
    };
  }
};

module.exports = StudentImportProfile;
