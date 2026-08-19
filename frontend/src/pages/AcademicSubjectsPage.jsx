import React, { useState, useEffect, useCallback } from 'react';
import { AcademicApi } from '../api/academic.api';
import { AcademicNav } from '../components/AcademicNav';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function AcademicSubjectsPage() {
  const [subjects, setSubjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSubjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await AcademicApi.listSubjects();
      if (data && data.subjects) {
        setSubjects(data.subjects);
      }
    } catch (err) {
      setError(err.message || 'تعذر تحميل المواد الدراسية.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const filteredSubjects = subjects.filter((s) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (s.nameAr && s.nameAr.toLowerCase().includes(term)) ||
      (s.nameEn && s.nameEn.toLowerCase().includes(term)) ||
      (s.code && s.code.toLowerCase().includes(term))
    );
  });

  return (
    <div className="academic-page-container">
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">المواد الدراسية</h2>
          <span className="page-subtitle">دليل المواد والخطط الدراسية المعتمدة والرموز الأكاديمية الرسمية</span>
        </div>

        <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
          إجمالي المواد: <strong>{subjects.length}</strong>
        </div>
      </div>

      <AcademicNav />

      {/* Search Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="ابحث باسم المادة أو الرمز الأكاديمي..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="البحث عن مادة دراسية"
            />
          </div>

          {searchTerm && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => setSearchTerm('')}
            >
              إلغاء البحث
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert type="error" message={error}>
          <button type="button" className="btn-reset-filters" onClick={fetchSubjects} style={{ marginRight: 'var(--spacing-3)' }}>
            إعادة المحاولة
          </button>
        </Alert>
      )}

      <div className="table-container">
        {isLoading ? (
          <LoadingSpinner text="جاري جلب المواد الدراسية..." />
        ) : filteredSubjects.length === 0 ? (
          <div className="placeholder-page" style={{ minHeight: '220px' }}>
            <div className="placeholder-icon">📖</div>
            <h3 className="placeholder-title">لا توجد مواد دراسية مسجلة</h3>
            <p className="placeholder-desc">لم يتم العثور على أي مادة دراسية تطابق البحث الحالي.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رمز المادة (Code)</th>
                  <th>اسم المادة بالعربية</th>
                  <th>الاسم بالإنجليزية</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubjects.map((sub) => (
                  <tr key={sub.id} style={{ cursor: 'default' }}>
                    <td>
                      <span className="student-code-badge">{sub.code}</span>
                    </td>
                    <td>
                      <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-primary)' }}>
                        {sub.nameAr}
                      </strong>
                    </td>
                    <td>
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {sub.nameEn || '-'}
                      </span>
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
