import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AcademicApi } from '../api/academic.api';
import { AcademicNav } from '../components/AcademicNav';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function AcademicPage() {
  const [currentYear, setCurrentYear] = useState(null);
  const [totalYears, setTotalYears] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await AcademicApi.listYears();
      if (data && data.academicYears) {
        setTotalYears(data.academicYears.length);
        const curr = data.academicYears.find((y) => y.isCurrent) || data.academicYears[0];
        setCurrentYear(curr || null);
      }
    } catch (err) {
      setError(err.message || 'تعذر تحميل بيانات الهيكل الأكاديمي.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="academic-page-container">
      {/* Header */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">الهيكل الأكاديمي</h2>
          <span className="page-subtitle">
            البنية التنظيمية التعليمية، السنوات الدراسية، المراحل، الصفوف، والشعب الصفية
          </span>
        </div>
      </div>

      {/* Sub Navigation */}
      <AcademicNav />

      {/* Error Alert */}
      {error && (
        <Alert type="error" message={error}>
          <button type="button" className="btn-reset-filters" onClick={fetchOverview} style={{ marginRight: 'var(--spacing-3)' }}>
            إعادة المحاولة
          </button>
        </Alert>
      )}

      {isLoading ? (
        <LoadingSpinner text="جاري تحميل الهيكل الأكاديمي..." />
      ) : (
        <>
          {/* Current Academic Year Hero Card */}
          {currentYear && (
            <div className="student-hero-card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <div className="student-hero-identity">
                <div className="student-hero-avatar">📅</div>
                <div className="student-hero-details">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                    <h3 className="student-hero-name">السنة الدراسية الحالية: {currentYear.name}</h3>
                    {currentYear.isCurrent && <span className="current-year-badge">السنة النشطة</span>}
                  </div>
                  <span className="student-hero-sub">
                    الفترة: من {formatDate(currentYear.startDate)} إلى {formatDate(currentYear.endDate)}
                  </span>
                </div>
              </div>

              {currentYear.academicTerms && currentYear.academicTerms.length > 0 && (
                <div className="year-terms-list">
                  {currentYear.academicTerms.map((t) => (
                    <span key={t.id} className="term-badge">
                      {t.nameAr}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hub Navigation Cards Grid */}
          <div className="academic-hub-grid">
            <Link to="/academic/years" className="academic-hub-card">
              <div className="hub-card-header">
                <div className="hub-card-icon">📅</div>
              </div>
              <h4 className="hub-card-title">السنوات والفصول الدراسية</h4>
              <p className="hub-card-desc">
                سجل السنوات الدراسية المعتمدة، الفصول الدراسية التابعة، وتواريخ البداية والنهاية.
              </p>
              <div className="hub-card-footer">
                <span>استعراض السنوات</span>
                <span>&larr;</span>
              </div>
            </Link>

            <Link to="/academic/stages" className="academic-hub-card">
              <div className="hub-card-header">
                <div className="hub-card-icon">🏫</div>
              </div>
              <h4 className="hub-card-title">المراحل والصفوف الدراسية</h4>
              <p className="hub-card-desc">
                الهيكل التدريجي للمراحل التعليمية (ابتدائي، متوسط، ثانوي) وتسكين الصفوف الدراسية.
              </p>
              <div className="hub-card-footer">
                <span>استعراض المراحل</span>
                <span>&larr;</span>
              </div>
            </Link>

            <Link to="/academic/classes" className="academic-hub-card">
              <div className="hub-card-header">
                <div className="hub-card-icon">👥</div>
              </div>
              <h4 className="hub-card-title">الشعب الصفية والفصول</h4>
              <p className="hub-card-desc">
                سجل الشعب المعتمدة لكل صف دراسي، سعة المقاعد، وتوزيع الأقسام (بنين / بنات).
              </p>
              <div className="hub-card-footer">
                <span>استعراض الشعب</span>
                <span>&larr;</span>
              </div>
            </Link>

            <Link to="/academic/subjects" className="academic-hub-card">
              <div className="hub-card-header">
                <div className="hub-card-icon">📖</div>
              </div>
              <h4 className="hub-card-title">المواد الدراسية</h4>
              <p className="hub-card-desc">
                دليل المواد والخطط الدراسية المعتمدة والرموز الأكاديمية الرسمية.
              </p>
              <div className="hub-card-footer">
                <span>استعراض المواد</span>
                <span>&larr;</span>
              </div>
            </Link>

            <Link to="/academic/sections" className="academic-hub-card">
              <div className="hub-card-header">
                <div className="hub-card-icon">🏢</div>
              </div>
              <h4 className="hub-card-title">الأقسام التعليمية (بنين / بنات)</h4>
              <p className="hub-card-desc">
                الأقسام المعتمدة في المنشأة التعليمية وتوزيع النطاقات المدرسية.
              </p>
              <div className="hub-card-footer">
                <span>استعراض الأقسام</span>
                <span>&larr;</span>
              </div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
