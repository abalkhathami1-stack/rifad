import React, { useState, useEffect, useCallback } from 'react';
import { AcademicApi } from '../api/academic.api';
import { AcademicNav } from '../components/AcademicNav';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function AcademicStagesPage() {
  const [stages, setStages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await AcademicApi.listStages();
      if (data && data.stages) {
        setStages(data.stages);
      }
    } catch (err) {
      setError(err.message || 'تعذر تحميل المراحل التعليمية.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  return (
    <div className="academic-page-container">
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">المراحل والصفوف الدراسية</h2>
          <span className="page-subtitle">الهيكل التدريجي للمراحل التعليمية والصفوف المسكنة تحت كل مرحلة</span>
        </div>

        <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
          إجمالي المراحل: <strong>{stages.length}</strong>
        </div>
      </div>

      <AcademicNav />

      {error && (
        <Alert type="error" message={error}>
          <button type="button" className="btn-reset-filters" onClick={fetchStages} style={{ marginRight: 'var(--spacing-3)' }}>
            إعادة المحاولة
          </button>
        </Alert>
      )}

      {isLoading ? (
        <LoadingSpinner text="جاري جلب المراحل والصفوف الدراسية..." />
      ) : stages.length === 0 ? (
        <div className="table-container">
          <div className="placeholder-page" style={{ minHeight: '220px' }}>
            <div className="placeholder-icon">🏫</div>
            <h3 className="placeholder-title">لا توجد مراحل تعليمية مسجلة</h3>
            <p className="placeholder-desc">لم يتم تسجيل أي مرحلة تعليمية في هذا النطاق المدرسي بعد.</p>
          </div>
        </div>
      ) : (
        <div className="stages-hierarchy-container">
          {stages.map((stage) => {
            const grades = stage.grades || [];

            return (
              <div key={stage.id} className="stage-hierarchy-card">
                <div className="stage-card-header">
                  <div className="stage-title">
                    <span>🏫</span>
                    <span>{stage.nameAr}</span>
                    {stage.nameEn && (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                        ({stage.nameEn})
                      </span>
                    )}
                  </div>
                  <span className="badge badge-primary">
                    الترتيب: {stage.stageOrder} &bull; عدد الصفوف: {grades.length}
                  </span>
                </div>

                <div className="grades-chips-grid">
                  {grades.length > 0 ? (
                    grades.map((grade) => (
                      <div key={grade.id} className="grade-chip">
                        <span className="grade-level-badge">مستوى {grade.gradeLevel}</span>
                        <span>{grade.nameAr}</span>
                        {grade.nameEn && (
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            ({grade.nameEn})
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                      لا توجد صفوف دراسية مسكنة تحت هذه المرحلة.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
