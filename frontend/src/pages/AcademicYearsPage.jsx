import React, { useState, useEffect, useCallback } from 'react';
import { AcademicApi } from '../api/academic.api';
import { AcademicNav } from '../components/AcademicNav';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function AcademicYearsPage() {
  const [years, setYears] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchYears = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await AcademicApi.listYears();
      if (data && data.academicYears) {
        setYears(data.academicYears);
      }
    } catch (err) {
      setError(err.message || 'تعذر تحميل السنوات الدراسية.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

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
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">السنوات والفصول الدراسية</h2>
          <span className="page-subtitle">سجل التقويم الأكاديمي، السنوات المعتمدة، والفصول الدراسية التابعة</span>
        </div>

        <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
          إجمالي السنوات: <strong>{years.length}</strong>
        </div>
      </div>

      <AcademicNav />

      {error && (
        <Alert type="error" message={error}>
          <button type="button" className="btn-reset-filters" onClick={fetchYears} style={{ marginRight: 'var(--spacing-3)' }}>
            إعادة المحاولة
          </button>
        </Alert>
      )}

      <div className="table-container">
        {isLoading ? (
          <LoadingSpinner text="جاري جلب السنوات والفصول الدراسية..." />
        ) : years.length === 0 ? (
          <div className="placeholder-page" style={{ minHeight: '220px' }}>
            <div className="placeholder-icon">📅</div>
            <h3 className="placeholder-title">لا توجد سنوات دراسية مسجلة</h3>
            <p className="placeholder-desc">لم يتم تسجيل أي سنة دراسية في هذا النطاق المدرسي حتى الآن.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>اسم السنة الدراسية</th>
                  <th>تاريخ البداية</th>
                  <th>تاريخ النهاية</th>
                  <th>الفصول الدراسية التابعة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year.id} style={{ cursor: 'default' }}>
                    <td>
                      <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-primary)' }}>
                        {year.name}
                      </strong>
                    </td>
                    <td>{formatDate(year.startDate)}</td>
                    <td>{formatDate(year.endDate)}</td>
                    <td>
                      {year.academicTerms && year.academicTerms.length > 0 ? (
                        <div className="year-terms-list">
                          {year.academicTerms.map((term) => (
                            <span key={term.id} className="term-badge">
                              {term.nameAr}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                          لا توجد فصول
                        </span>
                      )}
                    </td>
                    <td>
                      {year.isCurrent ? (
                        <span className="current-year-badge">السنة النشطة</span>
                      ) : (
                        <span className="badge badge-primary">سنة أرشيفية</span>
                      )}
                    </td>
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
