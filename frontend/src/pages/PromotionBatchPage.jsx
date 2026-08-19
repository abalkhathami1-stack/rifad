import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PromotionApi } from '../api/promotion.api';
import { AcademicApi } from '../api/academic.api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import {
  formatPromotionBatchStatus,
  formatPromotionAction,
  getPromotionStatusBadgeClass,
  getPromotionActionBadgeClass
} from '../utils/promotionStatus';
import { PromotionStepper } from '../components/PromotionStepper';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function PromotionBatchPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();

  const canEdit = can(PERMISSIONS.PROMOTION_EDIT_BATCH);
  const canApprove = can(PERMISSIONS.PROMOTION_APPROVE_BATCH);
  const canViewStudents = can(PERMISSIONS.STUDENTS_VIEW);

  const [batch, setBatch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);

  // Target Classes for override selection
  const [targetClasses, setTargetClasses] = useState([]);

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState(null);
  const [editFinalAction, setEditFinalAction] = useState('PROMOTE');
  const [editToClassId, setEditToClassId] = useState('');
  const [editOverrideReason, setEditOverrideReason] = useState('');
  const [editModalError, setEditModalError] = useState(null);
  const [isSavingItem, setIsSavingItem] = useState(false);

  // Execution Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const fetchBatch = useCallback(async () => {
    if (!batchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    setIsNotFound(false);

    try {
      const data = await PromotionApi.getBatchById(batchId, { includeItems: true });
      if (data && data.batch) {
        setBatch(data.batch);
        // Load target classes if available
        if (data.batch.targetAcademicYearId) {
          AcademicApi.listClassSections({ academicYearId: data.batch.targetAcademicYearId })
            .then((res) => {
              if (res && res.classes) setTargetClasses(res.classes);
            })
            .catch(() => {});
        }
      } else {
        setIsNotFound(true);
      }
    } catch (err) {
      if (err.status === 404) {
        setIsNotFound(true);
      } else {
        setErrorMessage(err.message || 'حدث خطأ أثناء تحميل تفاصيل دفعة الترفيع.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  // Generate Decisions
  const handleGenerateDecisions = async () => {
    if (!batch || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      await PromotionApi.generateBatchItems(batch.id);
      await fetchBatch();
    } catch (err) {
      setErrorMessage(err.message || 'فشل في توليد قرارات الترفيع.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Change Batch Status (e.g. DRAFT -> UNDER_REVIEW or back)
  const handleChangeStatus = async (newStatus) => {
    if (!batch || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      await PromotionApi.updateBatchStatus(batch.id, newStatus);
      await fetchBatch();
    } catch (err) {
      setErrorMessage(err.message || 'فشل تحديث حالة الدفعة.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Open Edit Item Modal
  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setEditFinalAction(item.finalAction || 'PROMOTE');
    setEditToClassId(item.toClassSectionId || '');
    setEditOverrideReason(item.overrideReason || '');
    setEditModalError(null);
  };

  // Save Item Override
  const handleSaveItemOverride = async (e) => {
    e.preventDefault();
    if (!editingItem || isSavingItem) return;

    setIsSavingItem(true);
    setEditModalError(null);

    try {
      await PromotionApi.updateBatchItem(editingItem.id, {
        finalAction: editFinalAction,
        toClassSectionId: editToClassId || null,
        overrideReason: editOverrideReason ? editOverrideReason.trim() : null
      });

      setEditingItem(null);
      await fetchBatch();
    } catch (err) {
      setEditModalError(err.message || 'فشل حفظ تعديل قرار الترفيع.');
    } finally {
      setIsSavingItem(false);
    }
  };

  // Execute / Approve Promotion Rollover
  const handleConfirmExecution = async () => {
    if (!batch || isExecuting) return;

    setIsExecuting(true);
    setErrorMessage(null);
    setShowConfirmModal(false);

    try {
      await PromotionApi.approveBatch(batch.id);
      await fetchBatch();
    } catch (err) {
      setErrorMessage(err.message || 'فشل تنفيذ وترحيل دفعة الترفيع.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    if (!batch || !batch.items) return [];

    return batch.items.filter((item) => {
      const studentName = item.student?.fullNameAr || '';
      const studentCode = item.student?.studentCode || '';
      const query = searchQuery.trim().toLowerCase();

      const matchesSearch =
        !query ||
        studentName.toLowerCase().includes(query) ||
        studentCode.toLowerCase().includes(query);

      const matchesAction = !actionFilter || item.finalAction === actionFilter;

      return matchesSearch && matchesAction;
    });
  }, [batch, searchQuery, actionFilter]);

  // Determine current stepper index (1..4)
  const getStepperIndex = () => {
    if (!batch) return 1;
    if (batch.status === 'APPROVED') return 4;
    if (batch.status === 'UNDER_REVIEW') return 3;
    if (batch.status === 'DRAFT' && batch.items && batch.items.length > 0) return 3;
    if (batch.status === 'DRAFT') return 2;
    return 1;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return <LoadingSpinner text="جاري تحميل بيانات دفعة الترفيع والقرارات..." />;
  }

  if (isNotFound) {
    return (
      <div className="promotion-page-container">
        <button type="button" className="back-link-btn" onClick={() => navigate('/promotion')}>
          &larr; العودة إلى مركز الترفيع والترحيل
        </button>
        <div className="placeholder-page" style={{ margin: 'var(--spacing-8) auto', maxWidth: '600px' }}>
          <div className="placeholder-icon" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
            🔍
          </div>
          <h3 className="placeholder-title">لم يتم العثور على دفعة الترفيع</h3>
          <p className="placeholder-desc">المعرف المطلوب غير موجود أو تم إلغاؤه.</p>
        </div>
      </div>
    );
  }

  const isApproved = batch?.status === 'APPROVED';
  const isCancelled = batch?.status === 'CANCELLED';
  const isDraft = batch?.status === 'DRAFT';
  const isUnderReview = batch?.status === 'UNDER_REVIEW';
  const hasItems = batch?.items && batch?.items.length > 0;

  return (
    <div className="promotion-page-container">
      <button type="button" className="back-link-btn" onClick={() => navigate('/promotion')}>
        &rarr; العودة إلى سجل دفعات الترفيع
      </button>

      {/* Stepper */}
      <PromotionStepper currentStep={getStepperIndex()} />

      {errorMessage && <Alert type="error" message={errorMessage} />}

      {/* Hero Card */}
      <div className="student-hero-card" style={{ marginBottom: 'var(--spacing-6)' }}>
        <div className="student-hero-identity">
          <div className="student-hero-avatar">🎓</div>
          <div className="student-hero-details">
            <h2 className="student-hero-name">
              حركة الترفيع: {batch?.sourceAcademicYear?.name} &larr; {batch?.targetAcademicYear?.name}
            </h2>
            <span className="student-hero-sub">
              المعرف: <code>{batch?.id}</code> &bull; أنشئت بواسطة: <strong>{batch?.createdBy?.fullName || batch?.createdBy?.username || '-'}</strong> ({formatDate(batch?.createdAt)})
              {batch?.approvedBy && (
                <> &bull; اعتمدت بواسطة: <strong>{batch.approvedBy.fullName || batch.approvedBy.username}</strong> ({formatDate(batch.approvedAt)})</>
              )}
            </span>
            {batch?.notes && (
              <p style={{ marginTop: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                📝 ملاحظات: {batch.notes}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <span className={`badge ${getPromotionStatusBadgeClass(batch?.status)}`}>
            {formatPromotionBatchStatus(batch?.status)}
          </span>
          <span className="badge badge-primary">
            {batch?.school?.nameAr || 'المدرسة'}
          </span>
        </div>
      </div>

      {/* Metrics Summary Grid */}
      <div className="promotion-metrics-grid">
        <div className="promotion-metric-card">
          <div className="metric-number" style={{ color: 'var(--color-primary)' }}>{batch?.totalStudents || 0}</div>
          <div className="metric-label">إجمالي طلاب الدفعة</div>
        </div>

        <div className="promotion-metric-card">
          <div className="metric-number promoted">{batch?.promotedCount || 0}</div>
          <div className="metric-label">المرفّعون للصف الأعلى</div>
        </div>

        <div className="promotion-metric-card">
          <div className="metric-number retained">{batch?.retainedCount || 0}</div>
          <div className="metric-label">الباقون للإعادة بالصف</div>
        </div>

        <div className="promotion-metric-card">
          <div className="metric-number graduated">{batch?.graduatedCount || 0}</div>
          <div className="metric-label">الطلاب المتخرجون</div>
        </div>
      </div>

      {/* APPROVED Success Receipt Banner */}
      {isApproved && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div className="alert-content">
            <span className="alert-title">تم اعتماد وترحيل الدفعة بنجاح!</span>
            <span>
              تم تحديث القيود الأكاديمية ونقل الطلاب المسجلين إلى السنة الدراسية المستهدفة ({batch?.targetAcademicYear?.name}) وتوثيق سجلات المراجعة.
            </span>
          </div>
        </div>
      )}

      {/* Action Bar */}
      {!isApproved && !isCancelled && (
        <div className="action-bar-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)' }}>
              الإجراءات المتاحة للدفعة:
            </span>
          </div>

          <div className="action-buttons-group">
            {isDraft && canEdit && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isProcessing}
                  onClick={handleGenerateDecisions}
                >
                  {isProcessing ? 'جارٍ التوليد...' : 'توليد القرارات المقترحة ⚙️'}
                </button>

                {hasItems && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isProcessing}
                    onClick={() => handleChangeStatus('UNDER_REVIEW')}
                  >
                    إرسال للمراجعة والتدقيق 📝
                  </button>
                )}
              </>
            )}

            {isUnderReview && canEdit && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isProcessing}
                  onClick={() => handleChangeStatus('DRAFT')}
                >
                  إعادة إلى مسودة ↩️
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: 'var(--color-error)' }}
                  disabled={isProcessing}
                  onClick={() => handleChangeStatus('CANCELLED')}
                >
                  إلغاء الدفعة ✕
                </button>
              </>
            )}

            {isUnderReview && canApprove && hasItems && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={isProcessing || isExecuting}
                onClick={() => setShowConfirmModal(true)}
                style={{ minWidth: '220px' }}
              >
                {isExecuting ? 'جارٍ التنفيذ والترحيل...' : 'تنفيذ الترفيع والترحيل النهائي 🚀'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Decisions Table & Filters */}
      <div className="table-container">
        <div style={{ padding: 'var(--spacing-4) var(--spacing-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-3)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
            جدول قرارات ترفيع الطلاب ({filteredItems.length})
          </h3>

          <div style={{ display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="search-input"
              style={{ width: '220px' }}
              placeholder="بحث بالاسم أو الكود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className="filter-select"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">كل القرارات</option>
              <option value="PROMOTE">ترقية للصف الأعلى</option>
              <option value="RETAIN">إعادة القيد بالصف</option>
              <option value="GRADUATE">تخرج</option>
              <option value="LEAVE">مغادرة / انسحاب</option>
            </select>
          </div>
        </div>

        {!hasItems ? (
          <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            لم يتم توليد قرارات الترفيع لهذه الدفعة بعد. انقر على "توليد القرارات المقترحة" أعلاه لتحليل وتوليد القرارات آلياً لجميع طلاب السنة المصدر.
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            لا توجد قرارات مطابقة لشروط البحث والفلترة.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>كود الطالب</th>
                  <th>اسم الطالب</th>
                  <th>الصف والشعبة الحالية</th>
                  <th>القرار المقترح</th>
                  <th>القرار النهائي</th>
                  <th>الشعبة المستهدفة</th>
                  <th>سبب التعديل / ملاحظات</th>
                  {!isApproved && !isCancelled && <th>الإجراء</th>}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isOverridden = item.suggestedAction !== item.finalAction || item.overrideReason;

                  return (
                    <tr key={item.id} style={{ cursor: 'default' }}>
                      <td>
                        <span className="student-code-badge">{item.student?.studentCode || '-'}</span>
                      </td>
                      <td>
                        {canViewStudents && item.student?.id ? (
                          <Link
                            to={`/students/${item.student.id}`}
                            className="student-name-link"
                            style={{ fontWeight: 700 }}
                          >
                            {item.student.fullNameAr}
                          </Link>
                        ) : (
                          <strong style={{ color: 'var(--color-text-main)' }}>
                            {item.student?.fullNameAr || '-'}
                          </strong>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: 'var(--font-size-xs)' }}>
                          {item.fromClassSection?.grade?.nameAr} &bull; {item.fromClassSection?.nameAr}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getPromotionActionBadgeClass(item.suggestedAction)}`}>
                          {formatPromotionAction(item.suggestedAction)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getPromotionActionBadgeClass(item.finalAction)}`}>
                          {formatPromotionAction(item.finalAction)}
                        </span>
                        {isOverridden && (
                          <div>
                            <span className="decision-override-badge">تعديل يدوي</span>
                          </div>
                        )}
                      </td>
                      <td>
                        {item.toClassSection ? (
                          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>
                            {item.toClassSection.grade?.nameAr} &bull; {item.toClassSection.nameAr}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                            -
                          </span>
                        )}
                      </td>
                      <td>
                        {item.overrideReason ? (
                          <span className="decision-reason-text">{item.overrideReason}</span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>-</span>
                        )}
                      </td>
                      {!isApproved && !isCancelled && (
                        <td>
                          {canEdit && (
                            <button
                              type="button"
                              className="btn-page"
                              onClick={() => handleOpenEditModal(item)}
                              style={{ padding: '2px 10px', fontSize: 'var(--font-size-xs)' }}
                            >
                              تعديل القرار ✏️
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Decision Modal */}
      {editingItem && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h4 className="modal-title">
                تعديل قرار الترفيع للطالب: {editingItem.student?.fullNameAr}
              </h4>
              <button
                type="button"
                className="back-link-btn"
                onClick={() => setEditingItem(null)}
                disabled={isSavingItem}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItemOverride}>
              <div className="modal-body">
                {editModalError && <Alert type="error" message={editModalError} />}

                <div style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
                    القرار المقترح تلقائياً من النظام:
                  </label>
                  <span className={`badge ${getPromotionActionBadgeClass(editingItem.suggestedAction)}`}>
                    {formatPromotionAction(editingItem.suggestedAction)}
                  </span>
                </div>

                <div style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
                    القرار النهائي المعتمد <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <select
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={editFinalAction}
                    onChange={(e) => setEditFinalAction(e.target.value)}
                    required
                  >
                    <option value="PROMOTE">ترقية للصف الأعلى (PROMOTE)</option>
                    <option value="RETAIN">إعادة القيد بالصف الحالي (RETAIN)</option>
                    <option value="GRADUATE">تخرج الطالب (GRADUATE)</option>
                    <option value="LEAVE">مغادرة / انسحاب من المدرسة (LEAVE)</option>
                  </select>
                </div>

                {(editFinalAction === 'PROMOTE' || editFinalAction === 'RETAIN') && (
                  <div style={{ marginBottom: 'var(--spacing-4)' }}>
                    <label className="input-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
                      الشعبة الصفية المستهدفة في العام القادم ({batch?.targetAcademicYear?.name}):
                    </label>
                    <select
                      className="filter-select"
                      style={{ width: '100%' }}
                      value={editToClassId}
                      onChange={(e) => setEditToClassId(e.target.value)}
                    >
                      <option value="">-- بدون تعيين مسبق للشعبة --</option>
                      {targetClasses.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.grade?.nameAr} - {cls.nameAr}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
                    سبب التعديل / الملاحظات الإدارية:
                  </label>
                  <textarea
                    className="search-input"
                    style={{ width: '100%', minHeight: '70px', resize: 'vertical' }}
                    value={editOverrideReason}
                    onChange={(e) => setEditOverrideReason(e.target.value)}
                    placeholder="مثال: قرار لجنة التوجيه والإرشاد أو إعادة قيد بناءً على تقرير طبي"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingItem(null)}
                  disabled={isSavingItem}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingItem}
                >
                  {isSavingItem ? 'جارٍ الحفظ...' : 'حفظ القرار المحدث'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Execution Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h4 className="modal-title">تأكيد اعتماد وتنفيذ الترفيع والترحيل السنوي</h4>
              <button
                type="button"
                className="back-link-btn"
                onClick={() => setShowConfirmModal(false)}
                disabled={isExecuting}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: 'var(--spacing-3)' }}>
                أنت على وشك تنفيذ الاعتماد النهائي لحركة الترفيع من <strong>{batch?.sourceAcademicYear?.name}</strong> إلى <strong>{batch?.targetAcademicYear?.name}</strong>.
              </p>

              <div style={{ background: 'var(--color-surface-hover)', padding: 'var(--spacing-3) var(--spacing-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-4)' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.8 }}>
                  <li>👥 إجمالي الطلاب المعنيين: <strong>{batch?.totalStudents}</strong></li>
                  <li>✅ المرفّعون للصف الأعلى: <strong>{batch?.promotedCount}</strong></li>
                  <li>⚠️ الباقون للإعادة: <strong>{batch?.retainedCount}</strong></li>
                  <li>🎓 المتخرجون: <strong>{batch?.graduatedCount}</strong></li>
                </ul>
              </div>

              <ul style={{ paddingRight: 'var(--spacing-5)', lineHeight: 1.8, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                <li>سيتم تحديث سجلات القيد السابقة وإنشاء تسجيلات نشطة جديدة في السنة المستهدفة.</li>
                <li>تتم العملية داخل معاملة ذرية كاملة (Single Atomic Database Transaction).</li>
                <li>لا يمكن التراجع عن هذه العملية أو إعادة تنفيذها على نفس الدفعة بعد اعتمادها.</li>
              </ul>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
                disabled={isExecuting}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmExecution}
                disabled={isExecuting}
              >
                {isExecuting ? 'جارٍ الاعتماد والترحيل...' : 'نعم، تأكيد وتنفيذ الترفيع النهائي 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
