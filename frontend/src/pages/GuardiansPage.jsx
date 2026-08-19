import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GuardiansApi } from '../api/guardians.api';
import { formatRelationship } from '../utils/relationships';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function GuardiansPage() {
  const navigate = useNavigate();

  // State Management
  const [guardians, setGuardians] = useState([]);
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
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch Guardians from API
  const fetchGuardians = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const data = await GuardiansApi.listGuardians(
        {
          query: debouncedSearch || undefined,
          status: statusFilter || undefined,
          page,
          limit
        },
        controller.signal
      );

      if (data) {
        const items = data.items || data.guardians || [];
        setGuardians(items);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'تعذر تحميل قائمة أولياء الأمور. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, page, limit]);

  useEffect(() => {
    fetchGuardians();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchGuardians]);

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

  const handleRowClick = (guardianId) => {
    navigate(`/guardians/${guardianId}`);
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge badge-success">نشط</span>;
      case 'INACTIVE':
        return <span className="badge badge-warning">غير نشط</span>;
      case 'SUSPENDED':
        return <span className="badge badge-error">موقوف</span>;
      default:
        return <span className="badge badge-primary">{status || 'غير محدد'}</span>;
    }
  };

  return (
    <div className="guardians-page-container">
      {/* Header Row */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">أولياء الأمور</h2>
          <span className="page-subtitle">
            سجل أولياء الأمور المعتمد، تشفير بيانات الاتصال والهوية، والربط بالطلاب
          </span>
        </div>

        <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
          إجمالي أولياء الأمور: <strong>{total}</strong>
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
              placeholder="ابحث بالاسم، الهوية الوطنية، أو رقم الجوال..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="البحث عن ولي أمر"
            />
          </div>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={handleStatusChange}
            aria-label="تصفية حسب الحالة"
          >
            <option value="">جميع الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="INACTIVE">غير نشط</option>
            <option value="SUSPENDED">موقوف</option>
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
            onClick={fetchGuardians}
            style={{ marginRight: 'var(--spacing-3)' }}
          >
            إعادة المحاولة
          </button>
        </Alert>
      )}

      {/* Data Table */}
      <div className="table-container">
        {isLoading ? (
          <LoadingSpinner text="جاري جلب سجلات أولياء الأمور..." />
        ) : guardians.length === 0 ? (
          <div className="placeholder-page" style={{ minHeight: '260px' }}>
            <div className="placeholder-icon">👨‍👩‍👧</div>
            <h3 className="placeholder-title">لا توجد بيانات أولياء أمور مطابقة</h3>
            <p className="placeholder-desc">
              لم يتم العثور على أي نتائج تطابق معايير البحث أو التصفية الحالية.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>اسم ولي الأمر</th>
                  <th>الاسم بالإنجليزية</th>
                  <th>صلة القرابة</th>
                  <th>الهوية الوطنية</th>
                  <th>رقم الجوال</th>
                  <th>البريد الإلكتروني</th>
                  <th>الطلاب المرتبطون</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {guardians.map((guardian) => {
                  const links = guardian.studentGuardians || [];
                  const primaryLink = links.find((l) => l.isPrimary) || links[0];
                  const relLabel = primaryLink ? formatRelationship(primaryLink.relationshipType) : '-';

                  return (
                    <tr
                      key={guardian.id}
                      onClick={() => handleRowClick(guardian.id)}
                      title="انقر لعرض الملف الشامل لولي الأمر"
                    >
                      <td>
                        <div className="student-name-cell">
                          <span className="student-name-ar">
                            {guardian.fullNameAr || `${guardian.firstNameAr || ''} ${guardian.familyNameAr || ''}`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="student-name-en">
                          {guardian.fullNameEn || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="relationship-badge">{relLabel}</span>
                      </td>
                      <td>
                        <span className="contact-masked-text">
                          {guardian.nationalId || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="contact-masked-text">
                          {guardian.phone || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="contact-masked-text">
                          {guardian.email || '-'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                          <span className="students-count-badge">{links.length}</span>
                          {links.length > 0 && (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                              {links.length === 1 ? 'طالب واحد' : links.length === 2 ? 'طالبان' : `${links.length} طلاب`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {renderStatusBadge(guardian.status)}
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
      {!isLoading && guardians.length > 0 && (
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
