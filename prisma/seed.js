const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PERMISSIONS = [
  // 1. Users Module (6 permissions)
  { code: 'users.view', module: 'users', description: 'عرض قائمة وتفاصيل المستخدمين' },
  { code: 'users.create', module: 'users', description: 'إنشاء حساب مستخدم جديد' },
  { code: 'users.edit', module: 'users', description: 'تعديل بيانات المستخدم والحالة' },
  { code: 'users.delete', module: 'users', description: 'حذف أو تعطيل حساب المستخدم' },
  { code: 'users.manage_roles', module: 'users', description: 'تعيين وإلغاء أدوار وصلاحيات المستخدمين' },
  { code: 'users.reset_password', module: 'users', description: 'إعادة تعيين كلمة مرور المستخدم' },

  // 2. Students Domain (5 permissions)
  { code: 'students.view', module: 'students', description: 'عرض قائمة وسجلات الطلاب' },
  { code: 'students.create', module: 'students', description: 'إضافة طالب جديد' },
  { code: 'students.edit', module: 'students', description: 'تعديل بيانات الطالب الأساسية' },
  { code: 'students.delete', module: 'students', description: 'حذف أو تعطيل سجل الطالب' },
  { code: 'students.enroll', module: 'students', description: 'تسكين ونقل الطالب بين الشعب والسنوات' },

  // 3. Teachers Domain (5 permissions)
  { code: 'teachers.view', module: 'teachers', description: 'عرض قائمة وبيانات المعلمين' },
  { code: 'teachers.create', module: 'teachers', description: 'إضافة معلم جديد وتحديد التخصص' },
  { code: 'teachers.edit', module: 'teachers', description: 'تعديل بيانات المعلم والتخصص' },
  { code: 'teachers.delete', module: 'teachers', description: 'حذف أو تعطيل سجل المعلم' },
  { code: 'teachers.assign', module: 'teachers', description: 'إسناد المواد والشعب والصفوف للمعلم' },

  // 4. Academic Structure Module (6 permissions)
  { code: 'academic.view', module: 'academic_structure', description: 'عرض الهيكل الأكاديمي والمراحل والصفوف' },
  { code: 'academic.manage_years', module: 'academic_structure', description: 'إدارة السنوات والفصول الدراسية وتفعيل السنة الحالية' },
  { code: 'academic.manage_stages', module: 'academic_structure', description: 'إدارة المراحل التعليمية' },
  { code: 'academic.manage_grades', module: 'academic_structure', description: 'إدارة الصفوف الدراسية' },
  { code: 'academic.manage_sections', module: 'academic_structure', description: 'إدارة الأقسام والشعب الصفية وسعتها' },
  { code: 'academic.manage_subjects', module: 'academic_structure', description: 'إدارة المواد الدراسية ورموزها' },

  // 5. Promotion & Rollover Module (5 permissions)
  { code: 'promotion.view', module: 'promotion', description: 'استعراض دفعات وحالات الترحيل السنوي' },
  { code: 'promotion.create_batch', module: 'promotion', description: 'إنشاء مسودة دفعة ترحيل جديدة' },
  { code: 'promotion.edit_batch', module: 'promotion', description: 'مراجعة وتعديل قرارات الترحيل الفردية للطلاب' },
  { code: 'promotion.approve_batch', module: 'promotion', description: 'اعتماد وتطبيق دفعة الترحيل السنوي نهائياً' },
  { code: 'promotion.cancel_batch', module: 'promotion', description: 'إلغاء دفعة الترحيل' },

  // 6. Import Engine Module (5 permissions)
  { code: 'import.view', module: 'import', description: 'استعراض سجلات ودفعات الاستيراد وحالاتها' },
  { code: 'import.upload', module: 'import', description: 'رفع ملفات الاستيراد الجديدة' },
  { code: 'import.validate', module: 'import', description: 'تشغيل فحص التحقق من صحة السطور والخلايا' },
  { code: 'import.commit', module: 'import', description: 'اعتماد وإدخال البيانات المحققة نهائياً إلى النظام' },
  { code: 'import.cancel', module: 'import', description: 'إلغاء أو حذف دفعة الاستيراد' },

  // 7. Audit & Security Module (2 permissions)
  { code: 'audit.view_logs', module: 'audit', description: 'استعراض سجل التدقيق والمراقبة الأمني' },
  { code: 'audit.export_logs', module: 'audit', description: 'تصدير سجلات التدقيق الأمني' },

  // 8. Guardian Domain Module (6 permissions)
  { code: 'guardians.view', module: 'guardians', description: 'استعراض قائمة وسجلات أولياء الأمور' },
  { code: 'guardians.view_sensitive', module: 'guardians', description: 'فك تشفير واستعراض البيانات الحساسة (الهوية، الجوال، البريد)' },
  { code: 'guardians.create', module: 'guardians', description: 'إضافة ولي أمر جديد' },
  { code: 'guardians.edit', module: 'guardians', description: 'تعديل بيانات ولي الأمر' },
  { code: 'guardians.delete', module: 'guardians', description: 'حذف أو تعطيل سجل ولي الأمر' },
  { code: 'guardians.link_student', module: 'guardians', description: 'ربط وفك ربط طالب بولي أمر' }
];

const ROLES = [
  {
    code: 'PLATFORM_OWNER',
    nameAr: 'مدير النظام العام',
    nameEn: 'Platform Owner / Super Admin',
    description: 'صلاحيات كاملة وغير مقيدة على كافة مدارس ووحدات النظام',
    isSystemRole: true,
    permissionCodes: '*' // All permissions
  },
  {
    code: 'SCHOOL_ADMIN',
    nameAr: 'مدير المدرسة',
    nameEn: 'School Principal / Administrator',
    description: 'الإدارة الكاملة لكافة العمليات والمستخدمين والطلاب والمعلمين وأولياء الأمور داخل المدرسة',
    isSystemRole: true,
    permissionCodes: [
      'users.view', 'users.create', 'users.edit', 'users.manage_roles', 'users.reset_password',
      'students.view', 'students.create', 'students.edit', 'students.delete', 'students.enroll',
      'teachers.view', 'teachers.create', 'teachers.edit', 'teachers.delete', 'teachers.assign',
      'academic.view', 'academic.manage_years', 'academic.manage_stages', 'academic.manage_grades', 'academic.manage_sections', 'academic.manage_subjects',
      'promotion.view', 'promotion.create_batch', 'promotion.edit_batch', 'promotion.approve_batch', 'promotion.cancel_batch',
      'import.view', 'import.upload', 'import.validate', 'import.commit', 'import.cancel',
      'guardians.view', 'guardians.view_sensitive', 'guardians.create', 'guardians.edit', 'guardians.delete', 'guardians.link_student',
      'audit.view_logs', 'audit.export_logs'
    ]
  },
  {
    code: 'ACADEMIC_ADMIN',
    nameAr: 'الوكيل الأكاديمي',
    nameEn: 'Academic Vice Principal',
    description: 'إدارة وتنسيق الهيكل الأكاديمي وشؤون الطلاب وإسناد المعلمين وإعداد الترحيل السنوي',
    isSystemRole: true,
    permissionCodes: [
      'students.view', 'students.create', 'students.edit', 'students.enroll',
      'teachers.view', 'teachers.assign',
      'academic.view', 'academic.manage_years', 'academic.manage_stages', 'academic.manage_grades', 'academic.manage_sections', 'academic.manage_subjects',
      'promotion.view', 'promotion.create_batch', 'promotion.edit_batch',
      'import.view', 'import.upload', 'import.validate',
      'guardians.view', 'guardians.link_student'
    ]
  },
  {
    code: 'REGISTRAR',
    nameAr: 'مسجل شؤون الطلاب والمعلمين',
    nameEn: 'Registrar / Data Entry Officer',
    description: 'تسجيل وقيد الطلاب والمعلمين وأولياء الأمور وتسكينهم ورفع ملفات الاستيراد المعتمدة',
    isSystemRole: true,
    permissionCodes: [
      'students.view', 'students.create', 'students.edit', 'students.enroll',
      'teachers.view', 'teachers.create', 'teachers.edit',
      'academic.view',
      'import.view', 'import.upload', 'import.validate',
      'guardians.view', 'guardians.create', 'guardians.edit', 'guardians.link_student'
    ]
  },
  {
    code: 'TEACHER',
    nameAr: 'معلم',
    nameEn: 'Teacher',
    description: 'استعراض المواد والشعب والصفوف المسندة وقوائم طلاب الشعب الخاصة به',
    isSystemRole: true,
    permissionCodes: [
      'students.view',
      'teachers.view',
      'academic.view'
    ]
  },
  {
    code: 'AUDITOR',
    nameAr: 'مدقق ومراجع نظامي',
    nameEn: 'Compliance & Quality Auditor',
    description: 'صلاحيات الاطلاع والقراءة فقط على كافة السجلات وسجلات التدقيق دون أي صلاحيات تعديل',
    isSystemRole: true,
    permissionCodes: [
      'users.view',
      'students.view',
      'teachers.view',
      'academic.view',
      'promotion.view',
      'import.view',
      'audit.view_logs', 'audit.export_logs'
    ]
  }
];

async function seedBaseline() {
  console.log('🚀 Starting System Roles & Permissions Baseline Seeding (Idempotent)...');

  // 1. Sync / Clean extra permissions not in baseline list
  const validCodes = PERMISSIONS.map(p => p.code);
  await prisma.permission.deleteMany({
    where: {
      code: { notIn: validCodes }
    }
  });

  // 2. Upsert Permissions (34 permissions)
  console.log(`📦 Upserting ${PERMISSIONS.length} Granular Permissions...`);
  const permissionMap = new Map();
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: {
        module: p.module,
        description: p.description
      },
      create: {
        code: p.code,
        module: p.module,
        description: p.description
      }
    });
    permissionMap.set(perm.code, perm.id);
  }
  console.log(`✅ ${permissionMap.size} Permissions upserted successfully.`);

  // 3. Upsert Roles & Map Role Permissions
  console.log(`🛡️ Upserting ${ROLES.length} System Baseline Roles...`);
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: {
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        description: r.description,
        isSystemRole: r.isSystemRole
      },
      create: {
        code: r.code,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        description: r.description,
        isSystemRole: r.isSystemRole
      }
    });

    // Determine target permission IDs for this role
    let targetPermIds = [];
    if (r.permissionCodes === '*') {
      targetPermIds = Array.from(permissionMap.values());
    } else {
      targetPermIds = r.permissionCodes
        .map(code => permissionMap.get(code))
        .filter(Boolean);
    }

    // Clear old mappings for this role to maintain exact sync
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: targetPermIds }
      }
    });

    // Link Role Permissions idempotently
    for (const permId of targetPermIds) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permId
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permId
        }
      });
    }
    console.log(`  - Role [${r.code}] mapped to ${targetPermIds.length} permissions.`);
  }

  console.log('🎉 System Roles & Permissions Baseline Seed Complete!');
}

if (require.main === module) {
  seedBaseline()
    .catch((e) => {
      console.error('❌ Error during seeding:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedBaseline, PERMISSIONS, ROLES };
