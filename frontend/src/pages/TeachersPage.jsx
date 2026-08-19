import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TeachersApi } from '../api/teachers.api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function TeachersPage() {
  const navigate = useNavigate();

  // State Management
  const [teachers, setTeachers] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [specializationFilter, setSpecializationFilter] = useState('');

  // UI Status
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // AbortController ref for race conditions
  const abortControllerRef = useRef(null);

  // Load Specializations for filter dropdown
  useEffect(() => {
    let isMounted = true;
    async function loadSpecializations() {
      try {
        const data = await TeachersApi.listSpecializations();
        if (isMounted && data && data.specializations) {
          setSpecializations(data.specializations);
        }
      } catch {
        // Non-blocking: filter will simply remain empty if call fails
      }
    }
    loadSpecializations();
    return () => {
      isMounted = false;
    };
  }, []);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch Teachers from API
  const fetchTeachers = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const data = await TeachersApi.listTeachers(
        {
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          specializationId: specializationFilter || undefined,
          page,
          limit
        },
        controller.signal
      );

      if (data) {
        setTeachers(data.teachers || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'تعذر تحميل قائمة المعلمين. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, specializationFilter, page, limit]);

  useEffect(() => {
    fetchTeachers();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchTeachers]);

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleSpecializationChange = (e) => {
    setSpecializationFilter(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setStatusFilter('');
    setSpecializationFilter('');
    setPage(1);
  };

  const handleRowClick = (teacherId) => {
    navigate(`/teachers/${teacherId}`);
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

  return (
    <div className="teachers-page-container">
      {/* Header Row */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">الهيئة التعليمية</h2>
          <span className="page-subtitle">
            سجل المعلمين المعتمد، التخصصات الأكاديمية، والتأهيل بالمواد الدراسية
          </span>
        </div>

        <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
          إجمالي المعلمين: <strong>{total}</strong>
        </div>
      </div>

      {/* Search & Filters Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="ابحث بالاسم العربي، الإنجليزي، أو الرقم الوظيفي..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="البحث عن معلم"
            />
          </div>

          <select
            className="filter-select"
            value={specializationFilter}
            onChange={handleSpecializationChange}
            aria-label="تصفية حسب التخصص"
          >
            <option value="">جميع التخصصات</option>
            {specializations.map((spec) => (
              <option key={spec.id} value={spec.id}>
                {spec.nameAr} {spec.code ? `(${spec.code})` : ''}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={handleStatusChange}
            aria-label="تصفية حسب الحالة الوظيفية"
          >
            <option value="">جميع الحالات الوظيفية</option>
            <option value="ACTIVE">على رأس العمل</option>
            <option value="ON_LEAVE">في إجازة</option>
            <option value="RESIGNED">مستقيل</option>
            <option value="TERMINATED">منهي خدماته</option>
          </select>

          {(searchTerm || statusFilter || specializationFilter) && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={handleResetFilters}
            >
              إعادة ضبط التصفية
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert type="error" message={error}>
          <button
            type="button"
            className="btn-reset-filters"
            onClick={fetchTeachers}
            style={{ marginRight: 'var(--spacing-3)' }}
          >
            إعادة المحاولة
          </button>
        </Alert>
      )}

      {/* Data Table */}
      <div className="table-container">
        {isLoading ? (
          <LoadingSpinner text="جاري جلب سجلات المعلمين..." />
        ) : teachers.length === 0 ? (
          <div className="placeholder-page" style={{ minHeight: '260px' }}>
            <div className="placeholder-icon">👨‍🏫</div>
            <h3 className="placeholder-title">لا توجد بيانات معلمين مطابقة</h3>
            <p className="placeholder-desc">
              لم يتم العثور على أي نتائج تطابق معايير البحث أو التصفية الحالية.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الرقم الوظيفي</th>
                  <th>اسم المعلم</th>
                  <th>الاسم بالإنجليزية</th>
                  <th>التخصص</th>
                  <th>المواد المؤهل لها</th>
                  <th>الهوية الوطنية</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => {
                  const specName = teacher.specialization?.nameAr || 'غير محدد';
                  const qualifiedSubjects = teacher.subjects || [];

                  return (
                    <tr
                      key={teacher.id}
                      onClick={() => handleRowClick(teacher.id)}
                      title="انقر لعرض الملف الشامل للمعلم"
                    >
                      <td>
                        <span className="student-code-badge">
                          {teacher.employeeNumber || '-'}
                        </span>
                      </td>
                      <td>
                        <div className="student-name-cell">
                          <span className="student-name-ar">
                            {teacher.fullNameAr || `${teacher.firstNameAr || ''} ${teacher.familyNameAr || ''}`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="student-name-en">
                          {teacher.fullNameEn || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="specialization-badge">{specName}</span>
                      </td>
                      <td>
                        <div className="subject-tags-container">
                          {qualifiedSubjects.length > 0 ? (
                            qualifiedSubjects.slice(0, 3).map((ts) => (
                              <span key={ts.id || ts.subject?.id} className="subject-tag">
                                {ts.subject?.nameAr || '-'}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>-</span>
                          )}
                          {qualifiedSubjects.length > 3 && (
                            <span className="subject-tag" title="المزيد">
                              +{qualifiedSubjects.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="contact-masked-text">
                          {teacher.nationalId || '-'}
                        </span>
                      </td>
                      <td>
                        {renderStatusBadge(teacher.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Bar */}
      {!isLoading && teachers.length > 0 && (
        <div className="pagination-bar">
          <span className="pagination-info">
            عرض الصفحة <strong>{page}</strong> من <strong>{totalPages}</strong> (إجمالي النتائج: {total})
          </span>

          <div className="pagination-actions">
            <button
              type="button"
              className="btn-page"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1}
            >
              السابق
            </button>
            <button
              type="button"
              className="btn-page"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages}
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
