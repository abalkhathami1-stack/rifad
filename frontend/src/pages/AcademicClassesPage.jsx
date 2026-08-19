import React, { useState, useEffect, useCallback } from 'react';
import { AcademicApi } from '../api/academic.api';
import { AcademicNav } from '../components/AcademicNav';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function AcademicClassesPage() {
  const [classSections, setClassSections] = useState([]);
  const [grades, setGrades] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch Filters Options
  useEffect(() => {
    let isMounted = true;
    async function loadFilters() {
      try {
        const [gradesData, divsData] = await Promise.all([
          AcademicApi.listGrades().catch(() => ({ grades: [] })),
          AcademicApi.listSections().catch(() => ({ sections: [] }))
        ]);
        if (isMounted) {
          setGrades(gradesData.grades || []);
          setDivisions(divsData.sections || []);
        }
      } catch {
        // Non-blocking
      }
    }
    loadFilters();
    return () => { isMounted = false; };
  }, []);

  const fetchClasses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await AcademicApi.listClassSections({
        gradeId: selectedGradeId || undefined,
        sectionDivisionId: selectedDivisionId || undefined
      });
      if (data && data.classSections) {
        setClassSections(data.classSections);
      }
    } catch (err) {
      setError(err.message || 'تعذر تحميل الشعب الصفية.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedGradeId, selectedDivisionId]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  return (
    <div className="academic-page-container">
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">الشعب الصفية والفصول</h2>
          <span className="page-subtitle">سجل الشعب المعتمدة لكل صف دراسي، سعة المقاعد، وتوزيع الأقسام</span>
        </div>

        <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
          إجمالي الشعب: <strong>{classSections.length}</strong>
        </div>
      </div>

      <AcademicNav />

      {/* Filters Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-row">
          <select
            className="filter-select"
            value={selectedGradeId}
            onChange={(e) => setSelectedGradeId(e.target.value)}
            aria-label="تصفية حسب الصف الدراسي"
          >
            <option value="">جميع الصفوف الدراسية</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameAr}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={selectedDivisionId}
            onChange={(e) => setSelectedDivisionId(e.target.value)}
            aria-label="تصفية حسب القسم التعليمي"
          >
            <option value="">جميع الأقسام التعليمية</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nameAr}
              </option>
            ))}
          </select>

          {(selectedGradeId || selectedDivisionId) && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => {
                setSelectedGradeId('');
                setSelectedDivisionId('');
              }}
            >
              إعادة ضبط التصفية
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert type="error" message={error}>
          <button type="button" className="btn-reset-filters" onClick={fetchClasses} style={{ marginRight: 'var(--spacing-3)' }}>
            إعادة المحاولة
          </button>
        </Alert>
      )}

      <div className="table-container">
        {isLoading ? (
          <LoadingSpinner text="جاري جلب الشعب الصفية..." />
        ) : classSections.length === 0 ? (
          <div className="placeholder-page" style={{ minHeight: '220px' }}>
            <div className="placeholder-icon">👥</div>
            <h3 className="placeholder-title">لا توجد شعب صفية مطابقة</h3>
            <p className="placeholder-desc">لم يتم العثور على أي شعب صفية تطابق معايير التصفية الحالية.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>اسم الشعبة</th>
                  <th>الصف الدراسي</th>
                  <th>المرحلة التعليمية</th>
                  <th>القسم التعليمي</th>
                  <th>السنة الدراسية</th>
                  <th>السعة القصوى</th>
                </tr>
              </thead>
              <tbody>
                {classSections.map((cs) => {
                  const gradeName = cs.grade?.nameAr || '-';
                  const stageName = cs.grade?.stage?.nameAr || '-';
                  const divName = cs.sectionDivision?.nameAr || '-';
                  const yearName = cs.academicYear?.name || '-';

                  return (
                    <tr key={cs.id} style={{ cursor: 'default' }}>
                      <td>
                        <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-primary)' }}>
                          شعبة ({cs.nameAr || cs.name || '-'})
                        </strong>
                      </td>
                      <td>{gradeName}</td>
                      <td>
                        <span className="badge badge-primary">{stageName}</span>
                      </td>
                      <td>{divName}</td>
                      <td>{yearName}</td>
                      <td>
                        <span className="student-code-badge">
                          {cs.maxCapacity || 30} مقعد
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
