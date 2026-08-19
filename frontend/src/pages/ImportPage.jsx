import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImportApi } from '../api/import.api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { formatBatchStatus, getBatchStatusBadgeClass } from '../utils/importStatus';
import { ImportStepper } from '../components/ImportStepper';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

export function ImportPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCommit = can(PERMISSIONS.IMPORT_COMMIT);
  const canUpload = can(PERMISSIONS.IMPORT_UPLOAD);
  const fileInputRef = useRef(null);

  // Workflow State: 1 = Upload, 2 = Validate & Review, 3 = Committed Summary
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Upload State
  const [entityType, setEntityType] = useState('STUDENTS');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Step 2: Batch & Validation State
  const [currentBatch, setCurrentBatch] = useState(null);
  const [validationPreview, setValidationPreview] = useState(null);
  const [batchErrors, setBatchErrors] = useState([]);
  const [isValidating, setIsValidating] = useState(false);

  // Step 3: Commit State & Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  // Historical Batches
  const [recentBatches, setRecentBatches] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Error & Feedback State
  const [errorMessage, setErrorMessage] = useState(null);

  // Fetch recent batches history
  const fetchBatchesHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const data = await ImportApi.listBatches({ limit: 10 });
      if (data && data.batches) {
        setRecentBatches(data.batches);
      }
    } catch {
      // Non-blocking for landing page
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchBatchesHistory();
  }, [fetchBatchesHistory]);

  // Handle File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExts = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const isValidExt = allowedExts.some((ext) => fileName.endsWith(ext));

    if (!isValidExt) {
      setErrorMessage('امتداد الملف غير مدعوم. يرجى اختيار ملف بصيغة XLSX أو XLS أو CSV فقط.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('حجم الملف يتجاوز الحد الأقصى المسموح به (10 ميجابايت).');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
  };

  // Step 1: Start Upload and Trigger Validation
  const handleStartImport = async () => {
    if (!selectedFile) {
      setErrorMessage('يرجى اختيار ملف للاستيراد أولاً.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      // 1. Create Batch in PENDING
      const batchRes = await ImportApi.createBatch({
        entityType,
        originalFileName: selectedFile.name
      });
      const batch = batchRes.batch;
      setCurrentBatch(batch);

      // 2. Upload file to batch
      await ImportApi.uploadFile(batch.id, selectedFile);

      // 3. Automatically trigger validation
      setIsValidating(true);
      setCurrentStep(2);
      setIsUploading(false);

      const valRes = await ImportApi.validateBatch(batch.id);
      
      // 4. Fetch preview and errors
      const [previewRes, errorsRes] = await Promise.all([
        ImportApi.getBatchPreview(batch.id),
        ImportApi.getBatchErrors(batch.id)
      ]);

      setValidationPreview(previewRes);
      setBatchErrors(errorsRes.errors || []);
      
      // Update currentBatch with latest values
      setCurrentBatch((prev) => ({
        ...prev,
        status: valRes.status,
        totalRows: valRes.totalRows,
        validRows: valRes.validRows,
        errorRows: valRes.errorRows
      }));

      fetchBatchesHistory();
    } catch (err) {
      setErrorMessage(err.message || 'حدث خطأ أثناء رفع ومعالجة ملف الاستيراد.');
    } finally {
      setIsUploading(false);
      setIsValidating(false);
    }
  };

  // Step 3: Handle Commit
  const handleConfirmCommit = async () => {
    if (!currentBatch || isCommitting) return;

    setIsCommitting(true);
    setErrorMessage(null);
    setShowConfirmModal(false);

    try {
      let result;
      if (currentBatch.entityType === 'STUDENTS') {
        result = await ImportApi.commitStudentOnboardingBatch(currentBatch.id);
      } else {
        result = await ImportApi.commitBatch(currentBatch.id);
      }

      setCommitResult(result);
      setCurrentStep(3);
      fetchBatchesHistory();
    } catch (err) {
      setErrorMessage(err.message || 'تعذر اعتماد دفعة الاستيراد.');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setSelectedFile(null);
    setCurrentBatch(null);
    setValidationPreview(null);
    setBatchErrors([]);
    setCommitResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  const isCommitEligible = currentBatch?.status === 'VALIDATED' && currentBatch?.errorRows === 0 && currentBatch?.validRows > 0;

  return (
    <div className="import-page-container">
      {/* Header */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">محرك استيراد البيانات</h2>
          <span className="page-subtitle">
            استيراد ملفات الطلاب والمعلمين، فحص المطابقة الأكاديمية، والترحيل الآمن إلى السجلات التشغيلية
          </span>
        </div>
      </div>

      {/* Workflow Stepper */}
      <ImportStepper currentStep={currentStep} />

      {/* Error Alert */}
      {errorMessage && (
        <Alert type="error" message={errorMessage} />
      )}

      {/* STEP 1: File Upload */}
      {currentStep === 1 && (
        <div className="details-section-card" style={{ marginBottom: 'var(--spacing-8)' }}>
          <h3 className="details-section-title">
            <span>📥</span>
            <span>رفع ملف الاستيراد الجديد</span>
          </h3>

          <div style={{ marginBottom: 'var(--spacing-5)' }}>
            <label className="input-label" style={{ display: 'block', marginBottom: 'var(--spacing-2)' }}>
              نوع البيانات المطلوب استيرادها:
            </label>
            <div style={{ display: 'flex', gap: 'var(--spacing-4)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="radio"
                  name="entityType"
                  value="STUDENTS"
                  checked={entityType === 'STUDENTS'}
                  onChange={(e) => setEntityType(e.target.value)}
                />
                <span>سجلات الطلاب وأولياء الأمور والتسكين (Students Onboarding)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="radio"
                  name="entityType"
                  value="TEACHERS"
                  checked={entityType === 'TEACHERS'}
                  onChange={(e) => setEntityType(e.target.value)}
                />
                <span>سجلات الهيئة التعليمية (Teachers)</span>
              </label>
            </div>
          </div>

          <div
            className="upload-dropzone-card"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="اختيار ملف للاستيراد"
          >
            <div className="upload-icon">📄</div>
            <h4 className="upload-title">انقر لاختيار ملف الاستيراد أو اسحبه هنا</h4>
            <p className="upload-subtitle">
              الصيغ المدعومة: جداول إكسل (XLSX, XLS) أو ملفات القيم المفصولة بفواصل (CSV) &bull; الحجم الأقصى: 10 ميجابايت
            </p>

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />

            {selectedFile && (
              <div className="selected-file-pill">
                <span>📎</span>
                <span className="file-name-text">{selectedFile.name}</span>
                <span className="file-size-text">({formatFileSize(selectedFile.size)})</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedFile || isUploading || !canUpload}
              onClick={handleStartImport}
              style={{ minWidth: '180px' }}
            >
              {isUploading ? 'جارٍ الرفع والمعالجة...' : 'بدء رفع وفحص الملف 🚀'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Validation & Review */}
      {currentStep === 2 && (
        <div className="validation-view-container" style={{ marginBottom: 'var(--spacing-8)' }}>
          {/* Batch Info Hero */}
          <div className="student-hero-card" style={{ marginBottom: 'var(--spacing-6)' }}>
            <div className="student-hero-identity">
              <div className="student-hero-avatar">📊</div>
              <div className="student-hero-details">
                <h3 className="student-hero-name">
                  دفعة استيراد: {currentBatch?.originalFileName || 'ملف غير معروف'}
                </h3>
                <span className="student-hero-sub">
                  المعرف: <code>{currentBatch?.id}</code> &bull; نوع الكيان: <strong>{currentBatch?.entityType}</strong>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
              <span className={`badge ${getBatchStatusBadgeClass(currentBatch?.status)}`}>
                {formatBatchStatus(currentBatch?.status)}
              </span>
              <button type="button" className="btn btn-secondary" onClick={handleReset}>
                استيراد ملف آخر
              </button>
            </div>
          </div>

          {isValidating ? (
            <LoadingSpinner text="جاري فحص وتدقيق سجلات الملف والتحقق من المطابقة الأكاديمية..." />
          ) : (
            <>
              {/* Metrics Grid */}
              <div className="import-metrics-grid">
                <div className="import-metric-card">
                  <div className="metric-number total">{currentBatch?.totalRows || 0}</div>
                  <div className="metric-label">إجمالي السجلات المفحوصة</div>
                </div>

                <div className="import-metric-card">
                  <div className="metric-number valid">{currentBatch?.validRows || 0}</div>
                  <div className="metric-label">السجلات الصالحة والمجازة</div>
                </div>

                <div className="import-metric-card">
                  <div className="metric-number errors">{currentBatch?.errorRows || 0}</div>
                  <div className="metric-label">السجلات ذات الأخطاء</div>
                </div>
              </div>

              {/* Status Callout */}
              {isCommitEligible ? (
                <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-6)' }}>
                  <div className="alert-content">
                    <span className="alert-title">جاهز للاعتماد النهائي!</span>
                    <span>تم اجتياز كافة قواعد التحقق والتسكين بنجاح 100%. يمكنك الآن اعتماد الاستيراد لنقل البيانات إلى الجداول التشغيلية.</span>
                  </div>
                </div>
              ) : (
                <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-6)' }}>
                  <div className="alert-content">
                    <span className="alert-title">توجد أخطاء تمنع الاعتماد!</span>
                    <span>يجب تصحيح الأخطاء الموضحة أدناه في ملف الإكسل وإعادة رفعه كدفعة جديدة لتجاوز التحقق.</span>
                  </div>
                </div>
              )}

              {/* Row-Level Errors Table */}
              {batchErrors.length > 0 && (
                <div className="table-container" style={{ marginBottom: 'var(--spacing-6)' }}>
                  <div style={{ padding: 'var(--spacing-4) var(--spacing-5)', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-error-bg)' }}>
                    <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-error)' }}>
                      تفاصيل أخطاء التحقق ({batchErrors.length})
                    </h4>
                  </div>

                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>رقم الصف</th>
                          <th>الحقل المتأثر</th>
                          <th>نوع الخطأ</th>
                          <th>رسالة التوجيه والتصحيح</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchErrors.map((err) => (
                          <tr key={err.id} style={{ cursor: 'default' }}>
                            <td>
                              <span className="student-code-badge">صف #{err.rowNumber}</span>
                            </td>
                            <td>
                              <strong>{err.fieldName || '-'}</strong>
                            </td>
                            <td>
                              <span className="error-badge">{err.errorCode || 'VALIDATION_ERROR'}</span>
                            </td>
                            <td>
                              <span style={{ color: 'var(--color-text-main)', fontSize: 'var(--font-size-sm)' }}>
                                {err.errorMessageAr}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)' }}>
                <button type="button" className="btn btn-secondary" onClick={handleReset}>
                  إلغاء والعودة
                </button>

                {canCommit && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!isCommitEligible || isCommitting}
                    onClick={() => setShowConfirmModal(true)}
                    style={{ minWidth: '200px' }}
                  >
                    {isCommitting ? 'جارٍ الاعتماد والتسكين...' : 'اعتماد الاستيراد وتسكين الطلاب ✅'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3: Final Commit Receipt */}
      {currentStep === 3 && commitResult && (
        <div className="commit-receipt-card">
          <div className="receipt-header">
            <div className="receipt-icon">✓</div>
            <div>
              <h3 className="receipt-title">تم اعتماد وترحيل دفعة الاستيراد بنجاح!</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                تم إنشاء السجلات التشغيلية، تشفير البيانات الحساسة، وتوثيق سجلات المراجعة الأمنية في النظام.
              </p>
            </div>
          </div>

          <div className="receipt-grid">
            <div className="receipt-stat-box">
              <div className="receipt-stat-value">{commitResult.summary?.createdStudentsCount || commitResult.insertedCount || 0}</div>
              <div className="receipt-stat-title">الطلاب المسجلون الجدد</div>
            </div>

            <div className="receipt-stat-box">
              <div className="receipt-stat-value">{commitResult.summary?.createdEnrollmentsCount || 0}</div>
              <div className="receipt-stat-title">التسجيلات في الشعب الصفية</div>
            </div>

            <div className="receipt-stat-box">
              <div className="receipt-stat-value">{commitResult.summary?.newGuardiansCreatedCount || 0}</div>
              <div className="receipt-stat-title">أولياء الأمور الجدد المضافون</div>
            </div>

            <div className="receipt-stat-box">
              <div className="receipt-stat-value">{commitResult.summary?.existingGuardiansReusedCount || 0}</div>
              <div className="receipt-stat-title">أولياء الأمور المعاد استخدامهم (سجل الأسرة)</div>
            </div>

            <div className="receipt-stat-box">
              <div className="receipt-stat-value">{commitResult.summary?.studentGuardianLinksCount || 0}</div>
              <div className="receipt-stat-title">روابط علاقات الطلاب وأولياء الأمور</div>
            </div>

            <div className="receipt-stat-box">
              <div className="receipt-stat-value">{commitResult.summary?.auditLogsCount || 0}</div>
              <div className="receipt-stat-title">سجلات المراجعة الأمنية الموثقة</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-6)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/students')}>
              الانتقال إلى قائمة الطلاب
            </button>
            <button type="button" className="btn btn-primary" onClick={handleReset}>
              استيراد دفعة جديدة
            </button>
          </div>
        </div>
      )}

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
                أنت على وشك اعتماد دفعة الاستيراد (<strong>{currentBatch?.originalFileName}</strong>) لعدد <strong>{currentBatch?.validRows}</strong> سجلاً صالحاً.
              </p>
              <ul style={{ paddingRight: 'var(--spacing-5)', lineHeight: 1.8 }}>
                <li>سيتم إنشاء السجلات الرسمية في قاعدة البيانات وتسكين الطلاب في الشعب.</li>
                <li>سيتم تشفير بيانات الهوية والجوال والبريد فورياً باستخدام خوارزميات التشفير المعتمدة.</li>
                <li>لا يمكن التراجع عن هذه العملية أو إعادة اعتماد نفس الدفعة مرة أخرى.</li>
              </ul>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)} disabled={isCommitting}>
                إلغاء
              </button>
              <button type="button" className="btn btn-primary" onClick={handleConfirmCommit} disabled={isCommitting}>
                {isCommitting ? 'جارٍ الاعتماد...' : 'نعم، تأكيد الاعتماد النهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historical Batches Table */}
      <div className="table-container" style={{ marginTop: 'var(--spacing-8)' }}>
        <div style={{ padding: 'var(--spacing-4) var(--spacing-5)', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-primary-surface)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
            سجل دفعات الاستيراد السابقة ({recentBatches.length})
          </h3>
        </div>

        {isLoadingHistory ? (
          <LoadingSpinner text="جاري جلب سجل الدفعات..." />
        ) : recentBatches.length === 0 ? (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            لا توجد دفعات استيراد مسجلة حتى الآن.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>اسم الملف</th>
                  <th>نوع الكيان</th>
                  <th>إجمالي السجلات</th>
                  <th>السجلات الصالحة</th>
                  <th>الأخطاء</th>
                  <th>الحالة</th>
                  <th>تاريخ الرفع</th>
                  <th>المستخدم</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((batch) => (
                  <tr key={batch.id} style={{ cursor: 'default' }}>
                    <td>
                      <strong style={{ color: 'var(--color-primary)' }}>
                        {batch.originalFileName}
                      </strong>
                    </td>
                    <td>
                      <span className="badge badge-primary">{batch.entityType}</span>
                    </td>
                    <td>{batch.totalRows}</td>
                    <td>
                      <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>
                        {batch.validRows}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: batch.errorRows > 0 ? 'var(--color-error)' : 'inherit', fontWeight: 700 }}>
                        {batch.errorRows}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getBatchStatusBadgeClass(batch.status)}`}>
                        {formatBatchStatus(batch.status)}
                      </span>
                    </td>
                    <td>{formatDate(batch.createdAt)}</td>
                    <td>{batch.uploadedBy?.fullName || batch.uploadedBy?.username || '-'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-page"
                        onClick={() => navigate(`/import/${batch.id}`)}
                        style={{ padding: '2px 10px', fontSize: 'var(--font-size-xs)' }}
                      >
                        عرض التفاصيل
                      </button>
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
