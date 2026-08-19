import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ImportApi } from '../api/import.api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { formatBatchStatus, getBatchStatusBadgeClass } from '../utils/importStatus';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function ImportBatchPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCommit = can(PERMISSIONS.IMPORT_COMMIT);
  const canValidate = can(PERMISSIONS.IMPORT_VALIDATE);

  const [batch, setBatch] = useState(null);
  const [errors, setErrors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  const fetchBatch = useCallback(async () => {
    if (!batchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    setIsNotFound(false);

    try {
      const [batchRes, errorsRes] = await Promise.all([
        ImportApi.getBatchById(batchId),
        ImportApi.getBatchErrors(batchId).catch(() => ({ errors: [] }))
      ]);

      if (batchRes && batchRes.batch) {
        setBatch(batchRes.batch);
        setErrors(errorsRes.errors || []);
      } else {
        setIsNotFound(true);
      }
    } catch (err) {
      if (err.status === 404) {
        setIsNotFound(true);
      } else {
        setErrorMessage(err.message || 'حدث خطأ أثناء تحميل بيانات دفعة الاستيراد.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  const handleValidate = async () => {
    if (!batch || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      await ImportApi.validateBatch(batch.id);
      await fetchBatch();
    } catch (err) {
      setErrorMessage(err.message || 'فشلت عملية التحقق من الدفعة.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async () => {
    if (!batch || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setShowConfirmModal(false);

    try {
      let result;
      if (batch.entityType === 'STUDENTS') {
        result = await ImportApi.commitStudentOnboardingBatch(batch.id);
      } else {
        result = await ImportApi.commitBatch(batch.id);
      }
      setCommitResult(result);
      await fetchBatch();
    } catch (err) {
      setErrorMessage(err.message || 'فشلت عملية الاعتماد والترحيل.');
    } finally {
      setIsProcessing(false);
    }
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
    return <LoadingSpinner text="جاري تحميل بيانات دفعة الاستيراد..." />;
  }

  if (isNotFound) {
    return (
      <div className="import-page-container">
        <button type="button" className="back-link-btn" onClick={() => navigate('/import')}>
          &larr; العودة إلى مركز الاستيراد
        </button>
        <div className="placeholder-page" style={{ margin: 'var(--spacing-8) auto', maxWidth: '600px' }}>
          <div className="placeholder-icon" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
            🔍
          </div>
          <h3 className="placeholder-title">لم يتم العثور على دفعة الاستيراد</h3>
          <p className="placeholder-desc">المعرف المطلوب غير موجود أو ربما تم حذفه.</p>
        </div>
      </div>
    );
  }

  const isCommitEligible = batch?.status === 'VALIDATED' && batch?.errorRows === 0 && batch?.validRows > 0;

  return (
    <div className="import-page-container">
      <button type="button" className="back-link-btn" onClick={() => navigate('/import')}>
        &rarr; العودة إلى مركز الاستيراد
      </button>

      {errorMessage && (
        <Alert type="error" message={errorMessage}>
          <button type="button" className="btn-reset-filters" onClick={fetchBatch} style={{ marginRight: 'var(--spacing-3)' }}>
            إعادة المحاولة
          </button>
        </Alert>
      )}

      {/* Batch Header Hero */}
      <div className="student-hero-card" style={{ marginBottom: 'var(--spacing-6)' }}>
        <div className="student-hero-identity">
          <div className="student-hero-avatar">📦</div>
          <div className="student-hero-details">
            <h2 className="student-hero-name">
              {batch?.originalFileName || 'ملف استيراد'}
            </h2>
            <span className="student-hero-sub">
              المعرف: <code>{batch?.id}</code> &bull; نوع الكيان: <strong>{batch?.entityType}</strong> &bull; تاريخ الرفع: {formatDate(batch?.createdAt)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <span className={`badge ${getBatchStatusBadgeClass(batch?.status)}`}>
            {formatBatchStatus(batch?.status)}
          </span>
          <span className="badge badge-primary">
            {batch?.school?.nameAr || 'المدرسة'}
          </span>
        </div>
      </div>

      {/* Metrics Summary Grid */}
      <div className="import-metrics-grid">
        <div className="import-metric-card">
          <div className="metric-number total">{batch?.totalRows || 0}</div>
          <div className="metric-label">إجمالي السجلات المفحوصة</div>
        </div>

        <div className="import-metric-card">
          <div className="metric-number valid">{batch?.validRows || 0}</div>
          <div className="metric-label">السجلات الصالحة والمجازة</div>
        </div>

        <div className="import-metric-card">
          <div className="metric-number errors">{batch?.errorRows || 0}</div>
          <div className="metric-label">السجلات ذات الأخطاء</div>
        </div>
      </div>

      {/* Commit Result Callout */}
      {commitResult && (
        <div className="commit-receipt-card" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div className="receipt-header">
            <div className="receipt-icon">✓</div>
            <div>
              <h3 className="receipt-title">تم اعتماد الدفعة بنجاح!</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                تم ترحيل البيانات وتوثيق سجلات المراجعة.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Validation Errors Table */}
      {errors.length > 0 && (
        <div className="table-container" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div style={{ padding: 'var(--spacing-4) var(--spacing-5)', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-error-bg)' }}>
            <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-error)' }}>
              أخطاء التحقق المسجلة ({errors.length})
            </h4>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم الصف</th>
                  <th>الحقل المتأثر</th>
                  <th>رمز الخطأ</th>
                  <th>رسالة التوجيه والتصحيح</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err) => (
                  <tr key={err.id} style={{ cursor: 'default' }}>
                    <td>
                      <span className="student-code-badge">صف #{err.rowNumber}</span>
                    </td>
                    <td>
                      <strong>{err.fieldName || '-'}</strong>
                    </td>
                    <td>
                      <span className="error-badge">{err.errorCode}</span>
                    </td>
                    <td>{err.errorMessageAr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)' }}>
        {batch?.status === 'PENDING' && canValidate && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={isProcessing}
            onClick={handleValidate}
          >
            {isProcessing ? 'جارٍ الفحص...' : 'فحص وتدقيق الدفعة 🔍'}
          </button>
        )}

        {isCommitEligible && canCommit && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={isProcessing}
            onClick={() => setShowConfirmModal(true)}
          >
            {isProcessing ? 'جارٍ الاعتماد...' : 'اعتماد وترحيل الدفعة ✅'}
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h4 className="modal-title">تأكيد اعتماد وترحيل دفعة الاستيراد</h4>
              <button type="button" className="back-link-btn" onClick={() => setShowConfirmModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: 'var(--spacing-3)' }}>
                أنت على وشك اعتماد دفعة الاستيراد (<strong>{batch?.originalFileName}</strong>) لعدد <strong>{batch?.validRows}</strong> سجلاً صالحاً.
              </p>
              <ul style={{ paddingRight: 'var(--spacing-5)', lineHeight: 1.8 }}>
                <li>سيتم إنشاء السجلات الرسمية في قاعدة البيانات وتسكين الطلاب في الشعب.</li>
                <li>سيتم تشفير بيانات الهوية والجوال والبريد فورياً باستخدام خوارزميات التشفير المعتمدة.</li>
                <li>لا يمكن التراجع عن هذه العملية أو إعادة اعتماد نفس الدفعة مرة أخرى.</li>
              </ul>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)} disabled={isProcessing}>
                إلغاء
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCommit} disabled={isProcessing}>
                {isProcessing ? 'جارٍ الاعتماد...' : 'نعم، تأكيد الاعتماد النهائي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
