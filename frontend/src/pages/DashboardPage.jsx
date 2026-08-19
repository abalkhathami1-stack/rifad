import React from 'react';
import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { user, roles, scopes, isPlatformLevel } = useAuth();

  const primaryRole = roles && roles.length > 0 ? (roles[0].nameAr || roles[0].code) : 'مستخدم النظام';
  const initialLetter = user?.fullName ? user.fullName.trim().charAt(0) : 'ر';

  return (
    <div className="dashboard-container">
      {/* Dashboard Welcome Header */}
      <div className="dashboard-header">
        <h2 className="dashboard-welcome-title">
          أهلاً بك، {user?.fullName || user?.username}
        </h2>
        <p className="dashboard-welcome-subtitle">
          مرحباً بك في منصة رِفاد لإدارة الهيكل الأكاديمي والعمليات المدرسية
        </p>
      </div>

      {/* Identity Card */}
      <div className="identity-card">
        <div className="identity-meta">
          <div className="identity-avatar">{initialLetter}</div>
          <div className="identity-details">
            <span className="identity-name">{user?.fullName || user?.username}</span>
            <span className="identity-sub">{user?.email || `اسم المستخدم: ${user?.username}`}</span>
          </div>
        </div>

        <div className="identity-tags">
          <span className="badge badge-primary">
            الدور الحالي: {primaryRole}
          </span>
          <span className="badge badge-success">
            الحالة: {user?.status === 'ACTIVE' ? 'نشط' : user?.status}
          </span>
          {isPlatformLevel && (
            <span className="badge badge-warning">
              نطاق عام (Platform Level)
            </span>
          )}
          {scopes && scopes.length > 0 && !isPlatformLevel && (
            <span className="badge badge-primary">
              النطاق: مدرسة محددة
            </span>
          )}
        </div>
      </div>

      {/* Structured Status Grid Placeholder */}
      <div className="dashboard-grid">
        <div className="stat-card-placeholder">
          <div className="stat-card-header">
            <span className="stat-card-title">شؤون الطلاب والقيد</span>
            <span className="badge badge-primary">قيد التفعيل</span>
          </div>
          <p className="stat-card-body">
            سجل الطلاب المعتمد، التسكين الأكاديمي في الشعب، وتتبع سجلات القيد السنوية.
          </p>
        </div>

        <div className="stat-card-placeholder">
          <div className="stat-card-header">
            <span className="stat-card-title">الهيئة التعليمية</span>
            <span className="badge badge-primary">قيد التفعيل</span>
          </div>
          <p className="stat-card-body">
            ملفات المعلمين، التخصصات، التأهيل بالمواد، وإسناد النصاب التدريسي للشعب.
          </p>
        </div>

        <div className="stat-card-placeholder">
          <div className="stat-card-header">
            <span className="stat-card-title">محرك الاستيراد والتهيئة</span>
            <span className="badge badge-primary">قيد التفعيل</span>
          </div>
          <p className="stat-card-body">
            معالجة ملفات Excel للطلاب وأولياء الأمور مع الكشف التلقائي عن صلات القرابة.
          </p>
        </div>

        <div className="stat-card-placeholder">
          <div className="stat-card-header">
            <span className="stat-card-title">الترفيع والترحيل السنوي</span>
            <span className="badge badge-primary">قيد التفعيل</span>
          </div>
          <p className="stat-card-body">
            إدارة دفعات الترفيع، الترحيل الآلي بين السنوات الدراسية، والتنفيذ الذري.
          </p>
        </div>
      </div>

      {/* Information Banner */}
      <div className="info-banner">
        <div className="info-banner-icon">ℹ️</div>
        <div className="info-banner-content">
          <h3 className="info-banner-title">حالة النظام التشغيلية</h3>
          <p className="info-banner-text">
            تم تأسيس طبقة الواجهة الأمامية الأساسية وربطها بجلسات الخادم بنجاح. ستظهر مؤشرات النظام الحية والإحصائيات التجميعية هنا فور ربط واجهات التقارير التحليلية في المرحلة القادمة.
          </p>
        </div>
      </div>
    </div>
  );
}
