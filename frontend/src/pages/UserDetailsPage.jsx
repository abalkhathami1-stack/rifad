import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UsersApi } from '../api/users.api';
import { SchoolsApi } from '../api/schools.api';
import { AcademicApi } from '../api/academic.api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { ROLE_LABELS_AR, formatRoleLabel } from '../utils/roleLabels';
import { formatUserStatus, formatScopeType, getUserStatusBadgeClass, formatSchoolSectionGender } from '../utils/userStatus';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'INACTIVE', label: 'غير نشط' },
  { value: 'SUSPENDED', label: 'معلّق' }
];

const ASSIGNABLE_ROLE_CODES = Object.keys(ROLE_LABELS_AR).filter((code) => code !== 'PLATFORM_OWNER');

export function UserDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, isPlatformLevel, can } = useAuth();

  const canEdit = can(PERMISSIONS.USERS_EDIT);
  const canManageRoles = can(PERMISSIONS.USERS_MANAGE_ROLES);
  const canResetPassword = can(PERMISSIONS.USERS_RESET_PASSWORD);

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState('');
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [statusError, setStatusError] = useState(null);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false);
  const [assignRoleCode, setAssignRoleCode] = useState('');
  const [assignScopeKind, setAssignScopeKind] = useState('SCHOOL'); // 'SCHOOL' | 'SECTION' — only relevant when a non-PLATFORM_OWNER role is selected
  const [assignSchoolId, setAssignSchoolId] = useState('');
  const [assignSectionDivisionId, setAssignSectionDivisionId] = useState('');
  const [myScopedSchools, setMyScopedSchools] = useState([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);
  const [assignSections, setAssignSections] = useState([]);
  const [isLoadingAssignSections, setIsLoadingAssignSections] = useState(false);
  const [assignSectionsError, setAssignSectionsError] = useState(null);
  const assignSectionsAbortRef = useRef(null);
  const [isAssigningRole, setIsAssigningRole] = useState(false);
  const [assignRoleError, setAssignRoleError] = useState(null);

  const fetchUser = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setIsNotFound(false);
    try {
      const data = await UsersApi.getUser(id);
      if (data && data.user) {
        setUser(data.user);
      } else {
        setIsNotFound(true);
      }
    } catch (err) {
      if (err.status === 404) {
        setIsNotFound(true);
      } else {
        setError(err.message || 'حدث خطأ أثناء تحميل ملف المستخدم.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const isSelf = currentUser?.id === id;

  const formatDate = (dateStr, withTime = false) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
      });
    } catch {
      return dateStr;
    }
  };

  // ─── Edit Profile (Backend allows self-edit — no self-restriction on PATCH /users/:id) ──
  const handleOpenEdit = () => {
    setEditFullName(user.fullName || '');
    setEditEmail(user.email || '');
    setEditError(null);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editFullName.trim()) { setEditError('الاسم الكامل مطلوب.'); return; }
    setIsSavingEdit(true);
    setEditError(null);
    try {
      await UsersApi.updateUser(id, { fullName: editFullName.trim(), email: editEmail.trim() || null });
      setShowEditModal(false);
      await fetchUser();
    } catch (err) {
      setEditError(err.message || 'فشل حفظ التعديلات.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ─── Status Change (Backend blocks self -> non-ACTIVE) ──────────
  const handleOpenStatusChange = (newStatus) => {
    setTargetStatus(newStatus);
    setStatusError(null);
    setShowStatusModal(true);
  };

  const handleConfirmStatusChange = async () => {
    setIsChangingStatus(true);
    setStatusError(null);
    try {
      await UsersApi.updateUserStatus(id, targetStatus);
      setShowStatusModal(false);
      await fetchUser();
    } catch (err) {
      setStatusError(err.message || 'فشل تغيير حالة المستخدم.');
    } finally {
      setIsChangingStatus(false);
    }
  };

  // ─── Reset Password ──────────────────────────────────────────────
  const handleOpenResetPassword = () => {
    setResetNewPassword('');
    setResetError(null);
    setResetSuccess(false);
    setShowResetModal(true);
  };

  const handleCloseResetModal = () => {
    setResetNewPassword('');
    setShowResetModal(false);
  };

  const handleConfirmReset = async (e) => {
    e.preventDefault();
    if (!resetNewPassword || resetNewPassword.length < 8) {
      setResetError('كلمة المرور الجديدة يجب ألا تقل عن 8 خانات.');
      return;
    }
    setIsResetting(true);
    setResetError(null);
    try {
      await UsersApi.resetUserPassword(id, resetNewPassword);
      setResetNewPassword('');
      setResetSuccess(true);
    } catch (err) {
      setResetNewPassword('');
      setResetError(err.message || 'فشل إعادة تعيين كلمة المرور.');
    } finally {
      setIsResetting(false);
    }
  };

  // ─── Assign Role ─────────────────────────────────────────────────
  const handleOpenAssignRole = async () => {
    setAssignRoleCode('');
    setAssignScopeKind('SCHOOL');
    setAssignSchoolId('');
    setAssignSectionDivisionId('');
    setAssignSections([]);
    setAssignSectionsError(null);
    setAssignRoleError(null);
    setShowAssignRoleModal(true);

    setIsLoadingSchools(true);
    try {
      const data = await SchoolsApi.listSchools();
      const schools = data?.schools || [];
      setMyScopedSchools(schools);
      if (!isPlatformLevel && schools.length === 1) setAssignSchoolId(schools[0].id);
    } catch {
      setMyScopedSchools([]);
    } finally {
      setIsLoadingSchools(false);
    }
  };

  const handleCloseAssignRole = () => {
    if (assignSectionsAbortRef.current) assignSectionsAbortRef.current.abort();
    setShowAssignRoleModal(false);
  };

  // Loads the SchoolSection catalog for a given school (GET /api/v1/academic/sections?schoolId=X).
  // Used only when assignScopeKind === 'SECTION'. Cancels any still-in-flight request
  // for a previous school before starting a new one.
  const loadSectionsForAssign = async (schoolIdValue) => {
    if (assignSectionsAbortRef.current) assignSectionsAbortRef.current.abort();
    if (!schoolIdValue) {
      setAssignSections([]);
      setAssignSectionsError(null);
      return;
    }
    const controller = new AbortController();
    assignSectionsAbortRef.current = controller;
    setIsLoadingAssignSections(true);
    setAssignSectionsError(null);
    try {
      const data = await AcademicApi.listSections({ schoolId: schoolIdValue }, controller.signal);
      setAssignSections(data?.sections || []);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setAssignSectionsError(err.message || 'تعذر تحميل الأقسام التعليمية لهذه المدرسة.');
        setAssignSections([]);
      }
    } finally {
      setIsLoadingAssignSections(false);
    }
  };

  // A new school selection always invalidates any previously chosen section —
  // a section from the old school must never survive into the new selection.
  const handleAssignSchoolChange = (schoolIdValue) => {
    setAssignSchoolId(schoolIdValue);
    setAssignSectionDivisionId('');
    if (assignScopeKind === 'SECTION') {
      loadSectionsForAssign(schoolIdValue);
    }
  };

  const handleAssignScopeKindChange = (kind) => {
    setAssignScopeKind(kind);
    setAssignSectionDivisionId('');
    if (kind === 'SECTION' && assignSchoolId) {
      loadSectionsForAssign(assignSchoolId);
    } else {
      if (assignSectionsAbortRef.current) assignSectionsAbortRef.current.abort();
      setAssignSections([]);
      setAssignSectionsError(null);
    }
  };

  const isAssignScopeIncomplete =
    Boolean(assignRoleCode) &&
    assignRoleCode !== 'PLATFORM_OWNER' &&
    (!assignSchoolId ||
      (assignScopeKind === 'SECTION' &&
        (isLoadingAssignSections || Boolean(assignSectionsError) || !assignSectionDivisionId)));

  const handleAssignRole = async (e) => {
    e.preventDefault();
    if (!assignRoleCode) { setAssignRoleError('يجب اختيار الدور المطلوب إسناده.'); return; }
    if (assignRoleCode !== 'PLATFORM_OWNER') {
      if (!assignSchoolId) { setAssignRoleError('يجب تحديد المدرسة.'); return; }
      if (assignScopeKind === 'SECTION' && !assignSectionDivisionId) {
        setAssignRoleError('يجب تحديد القسم التعليمي عند اختيار نطاق قسم محدد.');
        return;
      }
    }

    setIsAssigningRole(true);
    setAssignRoleError(null);
    try {
      const payload = { roleCode: assignRoleCode };
      if (assignRoleCode === 'PLATFORM_OWNER') {
        payload.scopeType = 'PLATFORM';
      } else if (assignScopeKind === 'SECTION') {
        payload.scopeType = 'SECTION';
        payload.schoolId = assignSchoolId;
        payload.sectionDivisionId = assignSectionDivisionId;
      } else {
        payload.scopeType = 'SCHOOL';
        payload.schoolId = assignSchoolId;
      }
      await UsersApi.assignRole(id, payload);
      setShowAssignRoleModal(false);
      await fetchUser();
    } catch (err) {
      setAssignRoleError(err.message || 'فشل إسناد الدور.');
    } finally {
      setIsAssigningRole(false);
    }
  };

  // ─── Remove Role ─────────────────────────────────────────────────
  const handleRemoveRole = async (assignment) => {
    if (!window.confirm(`هل أنت متأكد من إزالة دور "${assignment.role?.nameAr || formatRoleLabel(assignment.role?.code)}" عن هذا المستخدم؟`)) return;
    setIsProcessing(true);
    setError(null);
    try {
      await UsersApi.removeRole(id, assignment.id);
      await fetchUser();
    } catch (err) {
      setError(err.message || 'فشل إزالة الدور.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) return <LoadingSpinner text="جاري تحميل ملف المستخدم..." />;

  if (isNotFound) {
    return (
      <div className="user-details-container">
        <button type="button" className="back-link-btn" onClick={() => navigate('/users')}>&larr; العودة إلى المستخدمين</button>
        <div className="placeholder-page" style={{ margin: 'var(--spacing-8) auto', maxWidth: '600px' }}>
          <div className="placeholder-icon" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>🔍</div>
          <h3 className="placeholder-title">لم يتم العثور على المستخدم</h3>
          <p className="placeholder-desc">المعرف المطلوب غير موجود أو ليس لديك صلاحية استعراضه.</p>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="user-details-container">
        <button type="button" className="back-link-btn" onClick={() => navigate('/users')}>&larr; العودة إلى المستخدمين</button>
        <Alert type="error" message={error}>
          <button type="button" className="btn-reset-filters" onClick={fetchUser} style={{ marginRight: 'var(--spacing-3)' }}>إعادة المحاولة</button>
        </Alert>
      </div>
    );
  }

  if (!user) return null;

  const initialLetter = user.fullName ? user.fullName.trim().charAt(0) : 'م';
  const roleAssignments = user.roleAssignments || [];

  return (
    <div className="user-details-container">
      <button type="button" className="back-link-btn" onClick={() => navigate('/users')}>&rarr; العودة إلى سجل المستخدمين</button>

      {error && <Alert type="error" message={error} />}

      {/* User Hero Card */}
      <div className="user-hero-card">
        <div className="user-hero-identity">
          <div className="user-hero-avatar">{initialLetter}</div>
          <div className="user-hero-details">
            <h2 className="user-hero-name">{user.fullName}</h2>
            <span className="user-hero-sub">
              اسم المستخدم: <code>{user.username}</code>{user.email && <> &bull; {user.email}</>}
            </span>
            <div className="user-hero-badges">
              <span className={`badge ${getUserStatusBadgeClass(user.status)}`}>{formatUserStatus(user.status)}</span>
              {roleAssignments.map((a) => (
                <span key={a.id} className="badge badge-primary">{a.role?.nameAr || formatRoleLabel(a.role?.code)}</span>
              ))}
              {isSelf && <span className="badge badge-warning">هذا حسابك الحالي</span>}
            </div>
          </div>
        </div>

        <div className="user-hero-actions">
          {canEdit && (
            <button type="button" className="btn-action-secondary" onClick={handleOpenEdit}>تعديل الملف ✏️</button>
          )}
        </div>
      </div>

      {/* Status Actions */}
      {canEdit && (
        <div style={{ marginBottom: 'var(--spacing-5)' }}>
          {isSelf ? (
            <div className="action-info-box">لا يمكنك تعطيل أو تعليق حسابك الخاص — يجب أن يقوم إداري آخر بذلك.</div>
          ) : user.status !== 'ACTIVE' ? (
            <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--spacing-4)', flexWrap: 'wrap' }}>
              <span>الحساب في الحالة <strong>{formatUserStatus(user.status)}</strong>. يمكنك إعادة تفعيله.</span>
              <button type="button" className="btn-action-primary btn-action-sm" onClick={() => handleOpenStatusChange('ACTIVE')}>تفعيل الحساب ✓</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
              <button type="button" className="btn-action-secondary" style={{ color: 'var(--color-warning)' }} onClick={() => handleOpenStatusChange('INACTIVE')}>تعطيل الحساب مؤقتاً</button>
              <button type="button" className="btn-action-secondary" style={{ color: 'var(--color-error)' }} onClick={() => handleOpenStatusChange('SUSPENDED')}>تعليق الحساب</button>
              {canResetPassword && (
                <button type="button" className="btn-action-secondary" onClick={handleOpenResetPassword}>إعادة تعيين كلمة المرور 🔐</button>
              )}
            </div>
          )}
          {isSelf && canResetPassword && (
            <div style={{ marginTop: 'var(--spacing-3)' }}>
              <button type="button" className="btn-action-secondary" onClick={handleOpenResetPassword}>إعادة تعيين كلمة المرور 🔐</button>
            </div>
          )}
        </div>
      )}

      {/* Role Assignments */}
      <div className="table-container" style={{ marginBottom: 'var(--spacing-6)' }}>
        <div className="user-section-header">
          <h3 className="user-section-title">الأدوار والتكليفات ({roleAssignments.length})</h3>
          {canManageRoles && (
            <button type="button" className="btn-action-secondary btn-action-sm" onClick={handleOpenAssignRole}>+ إسناد دور جديد</button>
          )}
        </div>

        {roleAssignments.length === 0 ? (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            لم يُسند لهذا المستخدم أي دور بعد.
          </div>
        ) : (
          <div style={{ padding: 'var(--spacing-4)' }}>
            {roleAssignments.map((assignment) => {
              const isOwnerRole = assignment.role?.code === 'PLATFORM_OWNER';
              const blockedNotPlatformCaller = isOwnerRole && !isPlatformLevel;
              const blockedSelfOwner = isSelf && isOwnerRole;
              const blockedSelfLastRole = isSelf && roleAssignments.length <= 1;
              const removeBlocked = blockedNotPlatformCaller || blockedSelfOwner || blockedSelfLastRole;

              return (
                <div key={assignment.id} className="role-assignment-card">
                  <div className="role-assignment-info">
                    <span className="badge badge-primary">{assignment.role?.nameAr || formatRoleLabel(assignment.role?.code)}</span>
                    <span className="role-assignment-scope">
                      {formatScopeType(assignment.scopeType)}
                      {assignment.school?.nameAr && <> &bull; {assignment.school.nameAr}</>}
                      &bull; منذ {formatDate(assignment.createdAt)}
                    </span>
                    {blockedSelfOwner && <span className="role-assignment-locked-note">لا يمكنك إلغاء دور مالك المنصة الخاص بحسابك بنفسك</span>}
                    {!blockedSelfOwner && blockedSelfLastRole && <span className="role-assignment-locked-note">لا يمكنك حذف آخر دور إداري نشط لحسابك</span>}
                    {!blockedSelfOwner && !blockedSelfLastRole && blockedNotPlatformCaller && <span className="role-assignment-locked-note">إلغاء دور مالك المنصة متاح فقط لحساب على مستوى المنصة</span>}
                  </div>
                  {canManageRoles && (
                    <button
                      type="button"
                      className="btn-action-danger"
                      onClick={() => handleRemoveRole(assignment)}
                      disabled={isProcessing || removeBlocked}
                      title={removeBlocked ? 'هذا الإجراء غير متاح لهذا الإسناد' : undefined}
                    >
                      إزالة الدور ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="details-grid">
        <div className="details-section-card">
          <h3 className="details-section-title"><span>📇</span><span>بيانات الحساب</span></h3>
          <div className="info-rows">
            <div className="info-row"><span className="info-label">تاريخ الإنشاء</span><span className="info-value">{formatDate(user.createdAt)}</span></div>
            <div className="info-row"><span className="info-label">آخر تحديث</span><span className="info-value">{formatDate(user.updatedAt)}</span></div>
            <div className="info-row"><span className="info-label">آخر دخول</span><span className="info-value">{user.lastLoginAt ? formatDate(user.lastLoginAt, true) : 'لم يسجّل الدخول بعد'}</span></div>
          </div>
        </div>
      </div>

      {/* ─── Edit Profile Modal ─── */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h4 className="modal-title">تعديل ملف المستخدم</h4>
              <button type="button" className="back-link-btn" style={{ margin: 0 }} onClick={() => setShowEditModal(false)} disabled={isSavingEdit}>✕</button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-body">
                {editError && <Alert type="error" message={editError} />}
                <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="form-label">الاسم الكامل *</label>
                  <input type="text" className="form-input" value={editFullName} onChange={(e) => setEditFullName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">البريد الإلكتروني</label>
                  <input type="email" className="form-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </div>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-3)' }}>
                  ملاحظة: اسم المستخدم غير قابل للتعديل من هذه الشاشة.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-action-secondary" onClick={() => setShowEditModal(false)} disabled={isSavingEdit}>إلغاء</button>
                <button type="submit" className="btn-action-primary" disabled={isSavingEdit}>{isSavingEdit ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Status Change Modal ─── */}
      {showStatusModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h4 className="modal-title">تأكيد تغيير حالة الحساب</h4>
              <button type="button" className="back-link-btn" style={{ margin: 0 }} onClick={() => setShowStatusModal(false)} disabled={isChangingStatus}>✕</button>
            </div>
            <div className="modal-body">
              {statusError && <Alert type="error" message={statusError} />}
              <div className="action-warning-box">
                ⚠️ سيتم تغيير حالة المستخدم <strong>{user.fullName}</strong> من <strong>{formatUserStatus(user.status)}</strong> إلى{' '}
                <strong>{STATUS_OPTIONS.find((s) => s.value === targetStatus)?.label}</strong>.
                {targetStatus !== 'ACTIVE' && <><br />سيتم إلغاء جميع جلساته النشطة تلقائياً.</>}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-action-secondary" onClick={() => setShowStatusModal(false)} disabled={isChangingStatus}>إلغاء</button>
              <button type="button" className="btn-action-primary" onClick={handleConfirmStatusChange} disabled={isChangingStatus}>{isChangingStatus ? 'جارٍ التنفيذ...' : 'تأكيد التغيير'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reset Password Modal ─── */}
      {showResetModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h4 className="modal-title">إعادة تعيين كلمة المرور</h4>
              <button type="button" className="back-link-btn" style={{ margin: 0 }} onClick={handleCloseResetModal} disabled={isResetting}>✕</button>
            </div>
            {resetSuccess ? (
              <div className="modal-body">
                <Alert type="success" message="تم إعادة تعيين كلمة المرور بنجاح، وتم إلغاء جميع الجلسات النشطة لهذا المستخدم." />
                {isSelf && <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-3)' }}>سيُطلب منك تسجيل الدخول مجدداً في الجلسة الحالية.</p>}
                <div className="modal-actions" style={{ marginTop: 'var(--spacing-4)' }}>
                  <button type="button" className="btn-action-primary" onClick={handleCloseResetModal}>إغلاق</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmReset}>
                <div className="modal-body">
                  {resetError && <Alert type="error" message={resetError} />}
                  <div className="action-warning-box">
                    ⚠️ سيتم إعادة تعيين كلمة مرور <strong>{user.fullName}</strong> وإلغاء جميع جلساته الحالية فوراً.
                    {isSelf && ' سيشمل ذلك جلستك الحالية.'} كلمة المرور لا تُحفظ في الواجهة ولا تُعرض بعد التنفيذ.
                  </div>
                  <div className="form-group">
                    <label className="form-label">كلمة المرور الجديدة * <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>(8 خانات على الأقل)</span></label>
                    <input type="password" className="form-input" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-action-secondary" onClick={handleCloseResetModal} disabled={isResetting}>إلغاء</button>
                  <button type="submit" className="btn-action-primary" disabled={isResetting}>{isResetting ? 'جارٍ إعادة التعيين...' : 'تنفيذ إعادة التعيين 🔐'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Assign Role Modal ─── */}
      {showAssignRoleModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h4 className="modal-title">إسناد دور جديد للمستخدم</h4>
              <button type="button" className="back-link-btn" style={{ margin: 0 }} onClick={handleCloseAssignRole} disabled={isAssigningRole}>✕</button>
            </div>
            <form onSubmit={handleAssignRole}>
              <div className="modal-body">
                {assignRoleError && <Alert type="error" message={assignRoleError} />}
                <div className="action-warning-box">⚠️ إسناد دور جديد سيغيّر صلاحيات المستخدم فوراً.</div>

                <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="form-label">الدور المطلوب إسناده *</label>
                  <select className="filter-select" style={{ width: '100%' }} value={assignRoleCode} onChange={(e) => setAssignRoleCode(e.target.value)} required>
                    <option value="">-- اختر الدور --</option>
                    {(isPlatformLevel ? ['PLATFORM_OWNER', ...ASSIGNABLE_ROLE_CODES] : ASSIGNABLE_ROLE_CODES).map((code) => (
                      <option key={code} value={code}>{formatRoleLabel(code)}</option>
                    ))}
                  </select>
                </div>

                {assignRoleCode && assignRoleCode !== 'PLATFORM_OWNER' && (
                  <>
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
                      <label className="form-label">نطاق الإسناد *</label>
                      <select
                        className="filter-select"
                        style={{ width: '100%' }}
                        value={assignScopeKind}
                        onChange={(e) => handleAssignScopeKindChange(e.target.value)}
                      >
                        <option value="SCHOOL">المدرسة بالكامل</option>
                        <option value="SECTION">قسم تعليمي محدد داخل المدرسة</option>
                      </select>
                    </div>

                    <div className="modal-form-grid">
                      <div className="form-group">
                        <label className="form-label">المدرسة *</label>
                        {isLoadingSchools ? (
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>جاري التحميل...</span>
                        ) : myScopedSchools.length === 0 ? (
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>
                            {isPlatformLevel ? 'لا توجد مدارس مسجلة في النظام.' : 'لا توجد مدرسة مرتبطة بحسابك.'}
                          </span>
                        ) : !isPlatformLevel && myScopedSchools.length === 1 ? (
                          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{myScopedSchools[0].nameAr}</span>
                        ) : (
                          <select className="filter-select" style={{ width: '100%' }} value={assignSchoolId} onChange={(e) => handleAssignSchoolChange(e.target.value)} required>
                            <option value="">-- اختر المدرسة --</option>
                            {myScopedSchools.map((s) => (
                              <option key={s.id} value={s.id} disabled={s.isActive === false}>
                                {s.nameAr}{s.isActive === false ? ' (غير نشطة)' : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {assignScopeKind === 'SECTION' && (
                        <div className="form-group">
                          <label className="form-label">القسم التعليمي *</label>
                          {!assignSchoolId ? (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>اختر المدرسة أولاً</span>
                          ) : isLoadingAssignSections ? (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>جاري تحميل الأقسام...</span>
                          ) : assignSectionsError ? (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>{assignSectionsError}</span>
                          ) : assignSections.length === 0 ? (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>لا توجد أقسام تعليمية مسجلة لهذه المدرسة.</span>
                          ) : (
                            <select className="filter-select" style={{ width: '100%' }} value={assignSectionDivisionId} onChange={(e) => setAssignSectionDivisionId(e.target.value)} required>
                              <option value="">-- اختر القسم --</option>
                              {assignSections.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nameAr}{s.genderType ? ` (${formatSchoolSectionGender(s.genderType)})` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {assignRoleCode === 'PLATFORM_OWNER' && isPlatformLevel && (
                  <div className="action-warning-box" style={{ marginTop: 'var(--spacing-4)', marginBottom: 0 }}>
                    ⚠️ سيتم منح هذا المستخدم صلاحيات مالك المنصة الكاملة.
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-action-secondary" onClick={handleCloseAssignRole} disabled={isAssigningRole}>إلغاء</button>
                <button type="submit" className="btn-action-primary" disabled={isAssigningRole || isAssignScopeIncomplete}>
                  {isAssigningRole ? 'جارٍ الإسناد...' : 'إسناد الدور'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
