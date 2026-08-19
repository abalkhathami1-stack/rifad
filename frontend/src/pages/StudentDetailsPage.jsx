import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { StudentsApi } from '../api/students.api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function StudentDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const fetchStudent = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await StudentsApi.getStudentById(id);
      if (data && data.student) {
        setStudent(data.student);
      } else {
        setIsNotFound(true);
      }
    } catch (err) {
      if (err.status === 404) {
        setIsNotFound(true);
      } else {
        setError(err.message || 'حدث خطأ أثناء تحميل بيانات الطالب.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStudent();
  }, [fetchStudent]);

  const handleBack = () => {
    navigate('/students');
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge badge-success">نشط</span>;
      case 'SUSPENDED':
        return <span className="badge badge-warning">موقوف</span>;
      case 'GRADUATED':
        return <span className="badge badge-primary">متخرج</span>;
      case 'WITHDRAWN':
        return <span className="badge badge-error">منسحب</span>;
      case 'TRANSFERRED':
        return <span className="badge badge-primary">محوّل</span>;
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
    return <LoadingSpinner text="جاري تحميل الملف الشامل للطالب..." />;
  }

  if (isNotFound) {
    return (
      <div className="student-details-container">
        <button type="button" className="back-link-btn" onClick={handleBack}>
          &larr; العودة إلى قائمة الطلاب
        </button>
        <div className="placeholder-page" style={{ margin: 'var(--spacing-8) auto', maxWidth: '600px' }}>
          <div className="placeholder-icon" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
            🔍
          </div>
          <h3 className="placeholder-title">لم يتم العثور على الطالب</h3>
          <p className="placeholder-desc">
            الطالب المطلوب غير موجود أو ربما تم حذفه من النظام.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="student-details-container">
        <button type="button" className="back-link-btn" onClick={handleBack}>
          &larr; العودة إلى قائمة الطلاب
        </button>
        <Alert type="error" message={error}>
          <button
            type="button"
            className="btn-reset-filters"
            onClick={fetchStudent}
            style={{ marginRight: 'var(--spacing-3)' }}
          >
            إعادة المحاولة
          </button>
        </Alert>
      </div>
    );
  }

  if (!student) return null;

  const currentEnrollment = student.enrollments && student.enrollments.length > 0
    ? student.enrollments.find((e) => e.enrollmentStatus === 'ACTIVE') || student.enrollments[0]
    : null;

  const initialLetter = student.firstNameAr ? student.firstNameAr.charAt(0) : 'ط';

  return (
    <div className="student-details-container">
      {/* Navigation Header */}
      <button type="button" className="back-link-btn" onClick={handleBack}>
        &rarr; العودة إلى قائمة الطلاب
      </button>

      {/* Hero Header Card */}
      <div className="student-hero-card">
        <div className="student-hero-identity">
          <div className="student-hero-avatar">{initialLetter}</div>
          <div className="student-hero-details">
            <h2 className="student-hero-name">
              {student.fullNameAr || `${student.firstNameAr || ''} ${student.familyNameAr || ''}`}
            </h2>
            <span className="student-hero-sub">
              {student.fullNameEn || 'الاسم الإنجليزي غير مسجل'} &bull; كود الطالب: <strong>{student.studentCode || '-'}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          {renderStatusBadge(student.status)}
          <span className="badge badge-primary">
            {student.school?.nameAr || 'المدرسة الرئيسية'}
          </span>
        </div>
      </div>

      {/* Detailed Information Grid */}
      <div className="details-grid">
        {/* Basic Demographic Card */}
        <div className="details-section-card">
          <h3 className="details-section-title">
            <span>👤</span>
            <span>البيانات الأساسية والشخصية</span>
          </h3>

          <div className="info-rows">
            <div className="info-row">
              <span className="info-label">الهوية الوطنية / الإقامة</span>
              <span className="info-value" style={{ fontFamily: 'monospace' }}>
                {student.nationalId || '-'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">الجنس</span>
              <span className="info-value">
                {student.gender === 'MALE' ? 'ذكر' : student.gender === 'FEMALE' ? 'أنثى' : student.gender || '-'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">تاريخ الميلاد</span>
              <span className="info-value">
                {formatDate(student.birthDate)}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">الجنسية</span>
              <span className="info-value">
                {student.nationality || 'سعودي'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">فصيلة الدم</span>
              <span className="info-value">
                {student.bloodType || '-'}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">احتياجات خاصة</span>
              <span className="info-value">
                {student.specialNeeds ? 'نعم' : 'لا'}
              </span>
            </div>
          </div>
        </div>

        {/* Current Academic Placement Card */}
        <div className="details-section-card">
          <h3 className="details-section-title">
            <span>🏫</span>
            <span>الوضع الأكاديمي والتسكين الحالي</span>
          </h3>

          {currentEnrollment ? (
            <div className="info-rows">
              <div className="info-row">
                <span className="info-label">السنة الدراسية</span>
                <span className="info-value">
                  {currentEnrollment.academicYear?.name || '-'}
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">المرحلة التعليمية</span>
                <span className="info-value">
                  {currentEnrollment.classSection?.grade?.stage?.nameAr || '-'}
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">الصف الدراسي</span>
                <span className="info-value">
                  {currentEnrollment.classSection?.grade?.nameAr || '-'}
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">الشعبة والقسم</span>
                <span className="info-value">
                  شعبة ({currentEnrollment.classSection?.name || '-'})
                  {currentEnrollment.classSection?.sectionDivision?.nameAr
                    ? ` - ${currentEnrollment.classSection.sectionDivision.nameAr}`
                    : ''}
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">الفصل الدراسي</span>
                <span className="info-value">
                  {currentEnrollment.academicTerm?.nameAr || '-'}
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">تاريخ القيد</span>
                <span className="info-value">
                  {formatDate(currentEnrollment.enrollmentDate)}
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">حالة القيد</span>
                <span className="info-value">
                  {renderStatusBadge(currentEnrollment.enrollmentStatus)}
                </span>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--spacing-4)' }}>
              لا يوجد قيد أكاديمي نشط للطالب حالياً.
            </p>
          )}
        </div>
      </div>

      {/* Enrollment History Table */}
      {student.enrollments && student.enrollments.length > 0 && (
        <div className="table-container">
          <div style={{ padding: 'var(--spacing-4) var(--spacing-5)', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-primary-surface)' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
              سجل القيود والتنقلات الأكاديمية ({student.enrollments.length})
            </h3>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>السنة الدراسية</th>
                  <th>الصف</th>
                  <th>الشعبة</th>
                  <th>الفصل الدراسي</th>
                  <th>تاريخ القيد</th>
                  <th>حالة القيد</th>
                </tr>
              </thead>
              <tbody>
                {student.enrollments.map((enr) => (
                  <tr key={enr.id} style={{ cursor: 'default' }}>
                    <td>{enr.academicYear?.name || '-'}</td>
                    <td>{enr.classSection?.grade?.nameAr || '-'}</td>
                    <td>شعبة ({enr.classSection?.name || '-'})</td>
                    <td>{enr.academicTerm?.nameAr || '-'}</td>
                    <td>{formatDate(enr.enrollmentDate)}</td>
                    <td>{renderStatusBadge(enr.enrollmentStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
