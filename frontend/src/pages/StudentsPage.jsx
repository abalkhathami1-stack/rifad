import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { StudentsApi } from '../api/students.api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function StudentsPage() {
  const navigate = useNavigate();

  // State Management
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // UI Status
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // AbortController ref for race conditions
  const abortControllerRef = useRef(null);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1); // Reset to page 1 on search change
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch Students from API
  const fetchStudents = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const data = await StudentsApi.listStudents(
        {
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          page,
          limit
        },
        controller.signal
      );

      if (data) {
        setStudents(data.students || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'تعذر تحميل قائمة الطلاب. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, page, limit]);

  useEffect(() => {
    fetchStudents();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchStudents]);

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const handleRowClick = (studentId) => {
    navigate(`/students/${studentId}`);
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

  return (
    <div className="students-page-container">
      {/* Header Row */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">شؤون الطلاب</h2>
          <span className="page-subtitle">
            سجل الطلاب المعتمد والتسكين الأكاديمي في الصفوف والشعب
          </span>
        </div>

        <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
          إجمالي الطلاب: <strong>{total}</strong>
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
              placeholder="ابحث بالاسم، كود الطالب، أو الهوية الوطنية..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="البحث عن طالب"
            />
          </div>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={handleStatusChange}
            aria-label="تصفية حسب الحالة الأكاديمية"
          >
            <option value="">جميع الحالات الأكاديمية</option>
            <option value="ACTIVE">نشط</option>
            <option value="SUSPENDED">موقوف</option>
            <option value="GRADUATED">متخرج</option>
            <option value="WITHDRAWN">منسحب</option>
            <option value="TRANSFERRED">محوّل</option>
          </select>

          {(searchTerm || statusFilter) && (
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
            onClick={fetchStudents}
            style={{ marginRight: 'var(--spacing-3)' }}
          >
            إعادة المحاولة
          </button>
        </Alert>
      )}

      {/* Data Table */}
      <div className="table-container">
        {isLoading ? (
          <LoadingSpinner text="جاري جلب سجلات الطلاب..." />
        ) : students.length === 0 ? (
          <div className="placeholder-page" style={{ minHeight: '260px' }}>
            <div className="placeholder-icon">📋</div>
            <h3 className="placeholder-title">لا توجد بيانات طلاب مطابقة</h3>
            <p className="placeholder-desc">
              لم يتم العثور على أي نتائج تطابق معايير البحث أو التصفية الحالية.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>كود الطالب</th>
                  <th>اسم الطالب</th>
                  <th>الاسم بالإنجليزية</th>
                  <th>الهوية الوطنية</th>
                  <th>الصف الدراسي</th>
                  <th>الشعبة والقسم</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const activeEnrollment = student.enrollments && student.enrollments.length > 0
                    ? student.enrollments[0]
                    : null;
                  
                  const gradeName = activeEnrollment?.classSection?.grade?.nameAr || 'غير مسكن';
                  const sectionName = activeEnrollment?.classSection?.name || '-';
                  const divisionName = activeEnrollment?.classSection?.sectionDivision?.nameAr;

                  return (
                    <tr
                      key={student.id}
                      onClick={() => handleRowClick(student.id)}
                      title="انقر لعرض الملف الشامل للطالب"
                    >
                      <td>
                        <span className="student-code-badge">
                          {student.studentCode || '-'}
                        </span>
                      </td>
                      <td>
                        <div className="student-name-cell">
                          <span className="student-name-ar">
                            {student.fullNameAr || `${student.firstNameAr || ''} ${student.familyNameAr || ''}`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="student-name-en">
                          {student.fullNameEn || '-'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                          {student.nationalId || '-'}
                        </span>
                      </td>
                      <td>
                        <strong>{gradeName}</strong>
                      </td>
                      <td>
                        <span>
                          {sectionName !== '-' ? `شعبة (${sectionName})` : '-'}
                          {divisionName ? ` - ${divisionName}` : ''}
                        </span>
                      </td>
                      <td>
                        {renderStatusBadge(student.status)}
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
      {!isLoading && students.length > 0 && (
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
