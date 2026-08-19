import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TeachersApi } from '../api/teachers.api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function TeacherDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [teacher, setTeacher] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const fetchTeacher = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await TeachersApi.getTeacherById(id);
      if (data && data.teacher) {
        setTeacher(data.teacher);
      } else {
        setIsNotFound(true);
      }
    } catch (err) {
      if (err.status === 404) {
        setIsNotFound(true);
      } else {
        setError(err.message || 'حدث خطأ أثناء تحميل بيانات المعلم.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTeacher();
  }, [fetchTeacher]);

  const handleBack = () => {
    navigate('/teachers');
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge badge-success">على رأس العمل</span>;
      case 'ON_LEAVE':
        return <span className="badge badge-warning">في إجازة</span>;
      case 'RESIGNED':
        return <span className="badge badge-primary">مستقيل</span>;
      case 'TERMINATED':
        return <span className="badge badge-error">منهي خدماته</span>;
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
    return <LoadingSpinner text="جاري تحميل الملف الشامل للمعلم..." />;
  }

  if (isNotFound) {
    return (
      <div className="teacher-details-container">
        <button type="button" className="back-link-btn" onClick={handleBack}>
          &larr; العودة إلى قائمة المعلمين
        </button>
        <div className="placeholder-page" style={{ margin: 'var(--spacing-8) auto', maxWidth: '600px' }}>
          <div className="placeholder-icon" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
            🔍
          </div>
          <h3 className="placeholder-title">لم يتم العثور على المعلم</h3>
          <p className="placeholder-desc">
            المعلم المطلوب غير موجود أو ربما تم حذفه من النظام.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="teacher-details-container">
        <button type="button" className="back-link-btn" onClick={handleBack}>
          &larr; العودة إلى قائمة المعلمين
        </button>
        <Alert type="error" message={error}>
          <button
            type="button"
            className="btn-reset-filters"
            onClick={fetchTeacher}
            style={{ marginRight: 'var(--spacing-3)' }}
          >
            إعادة المحاولة
          </button>
        </Alert>
      </div>
    );
  }

  if (!teacher) return null;

  const initialLetter = teacher.firstNameAr ? teacher.firstNameAr.charAt(0) : 'م';
  const qualifiedSubjects = teacher.subjects || [];
  const assignments = teacher.assignments || [];

  return (
    <div className="teacher-details-container">
      {/* Navigation Header */}
      <button type="button" className="back-link-btn" onClick={handleBack}>
        &rarr; العودة إلى قائمة المعلمين
      </button>

      {/* Hero Header Card */}
      <div className="student-hero-card">
        <div className="student-hero-identity">
          <div className="student-hero-avatar">{initialLetter}</div>
          <div className="student-hero-details">
            <h2 className="student-hero-name">
              {teacher.fullNameAr || `${teacher.firstNameAr || ''} ${teacher.familyNameAr || ''}`}
            </h2>
            <span className="student-hero-sub">
              {teacher.fullNameEn || 'الاسم الإنجليزي غير مسجل'} &bull; الرقم الوظيفي: <strong>{teacher.employeeNumber || '-'}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
          <span className="specialization-badge">
            {teacher.specialization?.nameAr || 'تخصص عام'}
          </span>
          {renderStatusBadge(teacher.status)}
          <span className="badge badge-primary">
            {teacher.school?.nameAr || 'المدرسة الرئيسية'}
          </span>
        </div>
      </div>

      {/* Detailed Information Grid */}
      <div className="details-grid">
        {/* Basic & Employment Info Card */}
        <div className="details-section-card">
          <h3 className="details-section-title">
            <span>📋</span>
            <span>البيانات الأساسية والوظيفية</span>
          </h3>

          <div className="info-rows">
            <div className="info-row">
              <span className="info-label">الرقم الوظيفي</span>
              <span className="info-value" style={{ fontFamily: 'monospace' }}>
                {teacher.employeeNumber || '-'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">الهوية الوطنية / الإقامة</span>
              <span className="info-value contact-masked-text">
                {teacher.nationalId || '-'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">الجنسية</span>
              <span className="info-value">
                {teacher.nationality || 'سعودي'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">رقم الرخصة المهنية</span>
              <span className="info-value" style={{ fontFamily: 'monospace' }}>
                {teacher.professionalLicenseNumber || 'غير مسجل'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">تاريخ التعيين</span>
              <span className="info-value">
                {formatDate(teacher.hireDate)}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">رقم الجوال</span>
              <span className="info-value contact-masked-text">
                {teacher.phone || '-'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">البريد الإلكتروني</span>
              <span className="info-value contact-masked-text">
                {teacher.email || '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Specialization & Qualified Subjects Card */}
        <div className="details-section-card">
          <h3 className="details-section-title">
            <span>📚</span>
            <span>التخصص والتأهيل بالمواد الدراسية</span>
          </h3>

          <div className="info-rows">
            <div className="info-row">
              <span className="info-label">التخصص الرئيسي</span>
              <span className="info-value">
                {teacher.specialization?.nameAr || '-'}
                {teacher.specialization?.code ? ` (${teacher.specialization.code})` : ''}
              </span>
            </div>

            <div style={{ marginTop: 'var(--spacing-3)' }}>
              <span className="info-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
                المواد المؤهل لتدريسها ({qualifiedSubjects.length}):
              </span>
              
              {qualifiedSubjects.length > 0 ? (
                <div className="subject-tags-container" style={{ gap: 'var(--spacing-2)' }}>
                  {qualifiedSubjects.map((ts) => (
                    <span key={ts.id || ts.subject?.id} className="subject-tag" style={{ padding: '4px 10px', fontSize: 'var(--font-size-sm)' }}>
                      {ts.subject?.nameAr || '-'} {ts.subject?.code ? `(${ts.subject.code})` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                  لا توجد مواد مسندة لتأهيل هذا المعلم حتى الآن.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Teaching Assignments Table */}
      <div className="table-container">
        <div style={{ padding: 'var(--spacing-4) var(--spacing-5)', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-primary-surface)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
            الإسنادات التدريسية والشعب المسندة ({assignments.length})
          </h3>
        </div>

        {assignments.length === 0 ? (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            لا توجد إسنادات تدريسية نشطة للمعلم في الوقت الحالي.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>السنة الدراسية</th>
                  <th>المادة الدراسية</th>
                  <th>الصف الدراسي</th>
                  <th>الشعبة والقسم</th>
                  <th>الفصل الدراسي</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id} style={{ cursor: 'default' }}>
                    <td>
                      <strong>{assignment.academicYear?.name || '-'}</strong>
                    </td>
                    <td>
                      <span className="subject-tag">
                        {assignment.subject?.nameAr || '-'}
                      </span>
                    </td>
                    <td>{assignment.classSection?.grade?.nameAr || '-'}</td>
                    <td>
                      <span>
                        شعبة ({assignment.classSection?.name || assignment.classSection?.nameAr || '-'})
                        {assignment.classSection?.sectionDivision?.nameAr
                          ? ` - ${assignment.classSection.sectionDivision.nameAr}`
                          : ''}
                      </span>
                    </td>
                    <td>{assignment.academicTerm?.nameAr || 'طوال العام'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
