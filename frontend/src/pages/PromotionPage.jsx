import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PromotionApi } from '../api/promotion.api';
import { AcademicApi } from '../api/academic.api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { formatPromotionBatchStatus, getPromotionStatusBadgeClass } from '../utils/promotionStatus';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function PromotionPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCreate = can(PERMISSIONS.PROMOTION_CREATE_BATCH);

  const [batches, setBatches] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  // Create Batch Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sourceYearId, setSourceYearId] = useState('');
  const [targetYearId, setTargetYearId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchBatches = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await PromotionApi.listBatches({ page, limit: 15 });
      if (data) {
        setBatches(data.batches || []);
        setTotalPages(data.totalPages || 1);
        setTotalCount(data.total || 0);
      }
    } catch (err) {
      setErrorMessage(err.message || 'حدث خطأ أثناء تحميل سجل دفعات الترفيع.');
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  const fetchAcademicYears = async () => {
    try {
      const data = await AcademicApi.listYears();
      if (data && data.years) {
        setAcademicYears(data.years);
        // Find current year as default source
        const currentYear = data.years.find((y) => y.isCurrent);
        if (currentYear) {
          setSourceYearId(currentYear.id);
        }
      }
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const handleOpenCreateModal = () => {
    setModalError(null);
    setNotes('');
    fetchAcademicYears();
    setShowCreateModal(true);
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!sourceYearId || !targetYearId) {
      setModalError('يرجى اختيار السنة الدراسية الحالية (المصدر) والسنة الدراسية المستهدفة.');
      return;
    }

    if (sourceYearId === targetYearId) {
      setModalError('لا يمكن أن تكون السنة الدراسية المصدر هي نفسها السنة المستهدفة.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const result = await PromotionApi.createBatch({
        sourceAcademicYearId: sourceYearId,
        targetAcademicYearId: targetYearId,
        notes: notes ? notes.trim() : null
      });

      setShowCreateModal(false);
      if (result?.batch?.id) {
        navigate(`/promotion/${result.batch.id}`);
      } else {
        fetchBatches();
      }
    } catch (err) {
      setModalError(err.message || 'فشل إنشاء دفعة الترفيع.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="promotion-page-container">
      {/* Header */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">الترفيع والترحيل السنوي للطلاب</h2>
          <span className="page-subtitle">
            إدارة حركة الترفيع الأكاديمي السنوية، تدقيق ومراجعة قرارات النقل والتخرج، والترحيل الذري للقيود
          </span>
        </div>

        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={handleOpenCreateModal}>
            <span>+</span>
            <span>إنشاء دفعة ترفيع جديدة</span>
          </button>
        )}
      </div>

      {/* Sensitive Notice Banner */}
      <div className="alert alert-warning" style={{ marginBottom: 'var(--spacing-6)' }}>
        <div className="alert-content">
          <span className="alert-title">تنبيه تشغيلي مهم:</span>
          <span>
            عمليات الترفيع والترحيل هي إجراءات سنوية مركزية تؤثر على قيود الطلاب وتسكينهم في الشعب الصفية للعام الدراسي الجديد. يرجى التأكد من استكمال كافة الرصد والدرجات قبل الاعتماد النهائي.
          </span>
        </div>
      </div>

      {errorMessage && <Alert type="error" message={errorMessage} />}

      {/* Batches Table Card */}
      <div className="table-container">
        <div style={{ padding: 'var(--spacing-4) var(--spacing-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
            سجل دفعات الترفيع والترحيل ({totalCount})
          </h3>
        </div>

        {isLoading ? (
          <LoadingSpinner text="جاري تحميل سجل دفعات الترفيع..." />
        ) : batches.length === 0 ? (
          <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            لا توجد دفعات ترفيع مسجلة حتى الآن. انقر على "إنشاء دفعة ترفيع جديدة" للبدء.
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>السنة المصدر (الحالية)</th>
                    <th>السنة الهدف (القادمة)</th>
                    <th>إجمالي الطلاب</th>
                    <th>مرفّع</th>
                    <th>باقٍ</th>
                    <th>متخرّج</th>
                    <th>الحالة</th>
                    <th>تاريخ الإنشاء</th>
                    <th>المنشئ</th>
                    <th>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} style={{ cursor: 'default' }}>
                      <td>
                        <strong style={{ color: 'var(--color-primary)' }}>
                          {batch.sourceAcademicYear?.name || 'سنة غير محددة'}
                        </strong>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--color-text-main)' }}>
                          {batch.targetAcademicYear?.name || 'سنة غير محددة'}
                        </strong>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700 }}>{batch.totalStudents}</span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>
                          {batch.promotedCount}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>
                          {batch.retainedCount}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                          {batch.graduatedCount}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getPromotionStatusBadgeClass(batch.status)}`}>
                          {formatPromotionBatchStatus(batch.status)}
                        </span>
                      </td>
                      <td>{formatDate(batch.createdAt)}</td>
                      <td>{batch.createdBy?.fullName || batch.createdBy?.username || '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-page"
                          onClick={() => navigate(`/promotion/${batch.id}`)}
                          style={{ padding: '3px 12px', fontSize: 'var(--font-size-xs)' }}
                        >
                          عرض ومتابعة &larr;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination-bar">
                <span className="pagination-info">
                  الصفحة <strong>{page}</strong> من <strong>{totalPages}</strong> (إجمالي {totalCount} دفعة)
                </span>
                <div className="pagination-buttons">
                  <button
                    type="button"
                    className="btn-page"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    السابق
                  </button>
                  <button
                    type="button"
                    className="btn-page"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Batch Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h4 className="modal-title">إنشاء دفعة ترفيع وترحيل جديدة</h4>
              <button
                type="button"
                className="back-link-btn"
                onClick={() => setShowCreateModal(false)}
                disabled={isSubmitting}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBatch}>
              <div className="modal-body">
                {modalError && <Alert type="error" message={modalError} />}

                <div style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
                    السنة الدراسية المصدر (الحالية) <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <select
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={sourceYearId}
                    onChange={(e) => setSourceYearId(e.target.value)}
                    required
                  >
                    <option value="">-- اختر السنة المصدر --</option>
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.isCurrent ? '(السنة النشطة الحالية)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
                    السنة الدراسية الهدف (القادمة) <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <select
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={targetYearId}
                    onChange={(e) => setTargetYearId(e.target.value)}
                    required
                  >
                    <option value="">-- اختر السنة المستهدفة --</option>
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id} disabled={y.id === sourceYearId}>
                        {y.name} {y.id === sourceYearId ? '(لا يمكن اختيار نفس السنة)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
                    ملاحظات أو توجيهات إدارية (اختياري)
                  </label>
                  <textarea
                    className="search-input"
                    style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="مثال: دفعة الترفيع للعام الدراسي 1447هـ بعد اعتماد النتائج النهائية"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'جارٍ الإنشاء...' : 'إنشاء الدفعة ومتابعة القرارات 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
