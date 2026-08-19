import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { GuardiansApi } from '../api/guardians.api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { formatRelationship } from '../utils/relationships';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function GuardianDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [guardian, setGuardian] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const canViewStudents = can(PERMISSIONS.STUDENTS_VIEW);

  const fetchGuardian = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await GuardiansApi.getGuardianById(id);
      if (data && data.guardian) {
        setGuardian(data.guardian);
      } else {
        setIsNotFound(true);
      }
    } catch (err) {
      if (err.status === 404) {
        setIsNotFound(true);
      } else {
        setError(err.message || 'حدث خطأ أثناء تحميل بيانات ولي الأمر.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGuardian();
  }, [fetchGuardian]);

  const handleBack = () => {
    navigate('/guardians');
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge badge-success">نشط</span>;
      case 'INACTIVE':
        return <span className="badge badge-warning">غير نشط</span>;
      case 'SUSPENDED':
        return <span className="badge badge-error">موقوف</span>;
      default:
        return <span className="badge badge-primary">{status || 'غير محدد'}</span>;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return <LoadingSpinner text="جاري تحميل الملف الشامل لولي الأمر..." />;
  }

  if (isNotFound) {
    return (
      <div className="guardian-details-container">
        <button type="button" className="back-link-btn" onClick={handleBack}>
          &larr; العودة إلى قائمة أولياء الأمور
        </button>
        <div className="placeholder-page" style={{ margin: 'var(--spacing-8) auto', maxWidth: '600px' }}>
          <div className="placeholder-icon" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
            🔍
          </div>
          <h3 className="placeholder-title">لم يتم العثور على ولي الأمر</h3>
          <p className="placeholder-desc">
            سجل ولي الأمر المطلوب غير موجود أو ربما تم حذفه من النظام.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="guardian-details-container">
        <button type="button" className="back-link-btn" onClick={handleBack}>
          &larr; العودة إلى قائمة أولياء الأمور
        </button>
        <Alert type="error" message={error}>
          <button
            type="button"
            className="btn-reset-filters"
            onClick={fetchGuardian}
            style={{ marginRight: 'var(--spacing-3)' }}
          >
            إعادة المحاولة
          </button>
        </Alert>
      </div>
    );
  }

  if (!guardian) return null;

  const initialLetter = guardian.firstNameAr ? guardian.firstNameAr.charAt(0) : 'و';
  const studentLinks = guardian.studentGuardians || [];

  return (
    <div className="guardian-details-container">
      {/* Navigation Header */}
      <button type="button" className="back-link-btn" onClick={handleBack}>
        &rarr; العودة إلى قائمة أولياء الأمور
      </button>

      {/* Hero Header Card */}
      <div className="student-hero-card">
        <div className="student-hero-identity">
          <div className="student-hero-avatar">{initialLetter}</div>
          <div className="student-hero-details">
            <h2 className="student-hero-name">
              {guardian.fullNameAr || `${guardian.firstNameAr || ''} ${guardian.familyNameAr || ''}`}
            </h2>
            <span className="student-hero-sub">
              {guardian.fullNameEn || 'الاسم الإنجليزي غير مسجل'} &bull; عدد الطلاب التابعين: <strong>{studentLinks.length}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
          {renderStatusBadge(guardian.status)}
          <span className="badge badge-primary">
            {guardian.school?.nameAr || 'المدرسة الرئيسية'}
          </span>
        </div>
      </div>

      {/* Detailed Information Grid */}
      <div className="details-grid">
        {/* Basic Demographic & Professional Card */}
        <div className="details-section-card">
          <h3 className="details-section-title">
            <span>👤</span>
            <span>البيانات الأساسية والمهنية</span>
          </h3>

          <div className="info-rows">
            <div className="info-row">
              <span className="info-label">الهوية الوطنية / الإقامة</span>
              <span className="info-value contact-masked-text">
                {guardian.nationalId || '-'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">الجنسية</span>
              <span className="info-value">
                {guardian.nationality || 'سعودي'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">المهنة</span>
              <span className="info-value">
                {guardian.occupation || 'غير مسجل'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">جهة العمل</span>
              <span className="info-value">
                {guardian.workplace || 'غير مسجل'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">تاريخ التسجيل</span>
              <span className="info-value">
                {formatDate(guardian.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Contact Information Card */}
        <div className="details-section-card">
          <h3 className="details-section-title">
            <span>📞</span>
            <span>بيانات الاتصال والتواصل المعتمدة</span>
          </h3>

          <div className="info-rows">
            <div className="info-row">
              <span className="info-label">رقم الجوال</span>
              <span className="info-value contact-masked-text">
                {guardian.phone || '-'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">البريد الإلكتروني</span>
              <span className="info-value contact-masked-text">
                {guardian.email || 'غير مسجل'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Linked Students Table & Responsibilities */}
      <div className="table-container">
        <div style={{ padding: 'var(--spacing-4) var(--spacing-5)', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-primary-surface)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
            الطلاب المرتبطون والمسؤوليات القانونية ({studentLinks.length})
          </h3>
        </div>

        {studentLinks.length === 0 ? (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            لا يوجد طلاب مرتبطون بملف ولي الأمر هذا حالياً.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>اسم الطالب</th>
                  <th>كود الطالب</th>
                  <th>صلة القرابة</th>
                  <th>المسؤوليات والصلاحيات</th>
                  <th>حالة الطالب</th>
                </tr>
              </thead>
              <tbody>
                {studentLinks.map((link) => {
                  const student = link.student;
                  const relLabel = formatRelationship(link.relationshipType);

                  return (
                    <tr key={link.id} style={{ cursor: 'default' }}>
                      <td>
                        {canViewStudents && student?.id ? (
                          <Link
                            to={`/students/${student.id}`}
                            className="linked-student-link"
                            title="الانتقال إلى الملف الشامل للطالب"
                          >
                            {student.fullNameAr || 'طالب غير محدد'}
                          </Link>
                        ) : (
                          <span style={{ fontWeight: 700 }}>
                            {student?.fullNameAr || 'طالب غير محدد'}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="student-code-badge">
                          {student?.studentCode || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="relationship-badge">{relLabel}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {link.isPrimary && (
                            <span className="primary-badge">ولي الأمر الأساسي</span>
                          )}
                          {link.isEmergencyContact && (
                            <span className="flag-badge">اتصال طوارئ</span>
                          )}
                          {link.isFinanciallyResponsible && (
                            <span className="flag-badge">مسؤول مالي</span>
                          )}
                          {link.hasPickupAuthorization && (
                            <span className="flag-badge">مخول بالاستلام</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${student?.status === 'ACTIVE' ? 'badge-success' : 'badge-primary'}`}>
                          {student?.status === 'ACTIVE' ? 'نشط' : student?.status || 'غير محدد'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
