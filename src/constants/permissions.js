const PERMISSIONS = {
  // Users Module
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE_ROLES: 'users.manage_roles',
  USERS_RESET_PASSWORD: 'users.reset_password',

  // Students Domain
  STUDENTS_VIEW: 'students.view',
  STUDENTS_CREATE: 'students.create',
  STUDENTS_EDIT: 'students.edit',
  STUDENTS_DELETE: 'students.delete',
  STUDENTS_ENROLL: 'students.enroll',

  // Teachers Domain
  TEACHERS_VIEW: 'teachers.view',
  TEACHERS_CREATE: 'teachers.create',
  TEACHERS_EDIT: 'teachers.edit',
  TEACHERS_DELETE: 'teachers.delete',
  TEACHERS_ASSIGN: 'teachers.assign',

  // Academic Structure
  ACADEMIC_VIEW: 'academic.view',
  ACADEMIC_MANAGE_YEARS: 'academic.manage_years',
  ACADEMIC_MANAGE_STAGES: 'academic.manage_stages',
  ACADEMIC_MANAGE_GRADES: 'academic.manage_grades',
  ACADEMIC_MANAGE_SECTIONS: 'academic.manage_sections',
  ACADEMIC_MANAGE_SUBJECTS: 'academic.manage_subjects',

  // Promotion & Rollover
  PROMOTION_VIEW: 'promotion.view',
  PROMOTION_CREATE_BATCH: 'promotion.create_batch',
  PROMOTION_EDIT_BATCH: 'promotion.edit_batch',
  PROMOTION_APPROVE_BATCH: 'promotion.approve_batch',
  PROMOTION_CANCEL_BATCH: 'promotion.cancel_batch',

  // Import Engine
  IMPORT_VIEW: 'import.view',
  IMPORT_UPLOAD: 'import.upload',
  IMPORT_VALIDATE: 'import.validate',
  IMPORT_COMMIT: 'import.commit',
  IMPORT_CANCEL: 'import.cancel',

  // Guardian Domain
  GUARDIANS_VIEW: 'guardians.view',
  GUARDIANS_VIEW_SENSITIVE: 'guardians.view_sensitive',
  GUARDIANS_CREATE: 'guardians.create',
  GUARDIANS_EDIT: 'guardians.edit',
  GUARDIANS_DELETE: 'guardians.delete',
  GUARDIANS_LINK_STUDENT: 'guardians.link_student',

  // Audit & Security
  AUDIT_VIEW_LOGS: 'audit.view_logs',
  AUDIT_EXPORT_LOGS: 'audit.export_logs'
};

module.exports = { PERMISSIONS };

