import React, { useState, useEffect, useCallback } from 'react';
import { AcademicApi } from '../api/academic.api';
import { AcademicNav } from '../components/AcademicNav';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function AcademicSectionsPage() {
  const [sections, setSections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await AcademicApi.listSections();
      if (data && data.sections) {
        setSections(data.sections);
      }
    } catch (err) {
      setError(err.message || 'تعذر تحميل الأقسام التعليمية.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const renderGenderBadge = (gender) => {
    switch (gender) {
      case 'BOYS':
      case 'MALE':
        return <span className="badge badge-primary">بنين</span>;
      case 'GIRLS':
      case 'FEMALE':
        return <span className="badge badge-warning">بنات</span>;
      case 'MIXED':
      case 'COED':
        return <span className="badge badge-success">مشترك</span>;
      default:
        return <span className="badge badge-primary">{gender || 'عام'}</span>;
    }
  };

  return (
    <div className="academic-page-container">
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">الأقسام التعليمية</h2>
          <span className="page-subtitle">سجل الأقسام المعتمدة في المنشأة وتوزيع النطاقات المدرسية</span>
        </div>

        <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
          إجمالي الأقسام: <strong>{sections.length}</strong>
        </div>
      </div>

      <AcademicNav />

      {error && (
        <Alert type="error" message={error}>
          <button type="button" className="btn-reset-filters" onClick={fetchSections} style={{ marginRight: 'var(--spacing-3)' }}>
            إعادة المحاولة
          </button>
        </Alert>
      )}

      <div className="table-container">
        {isLoading ? (
          <LoadingSpinner text="جاري جلب الأقسام التعليمية..." />
        ) : sections.length === 0 ? (
          <div className="placeholder-page" style={{ minHeight: '220px' }}>
            <div className="placeholder-icon">🏢</div>
            <h3 className="placeholder-title">لا توجد أقسام تعليمية مسجلة</h3>
            <p className="placeholder-desc">لم يتم تسجيل أي قسم تعليمي في هذا النطاق المدرسي بعد.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>اسم القسم بالعربية</th>
                  <th>الاسم بالإنجليزية</th>
                  <th>نوع التقسيم (الجنس)</th>
                  <th>تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <tr key={sec.id} style={{ cursor: 'default' }}>
                    <td>
                      <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-primary)' }}>
                        {sec.nameAr}
                      </strong>
                    </td>
                    <td>
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {sec.nameEn || '-'}
                      </span>
                    </td>
                    <td>
                      {renderGenderBadge(sec.genderType)}
                    </td>
                    <td>{formatDate(sec.createdAt)}</td>
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
