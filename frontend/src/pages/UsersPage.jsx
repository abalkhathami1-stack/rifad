import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UsersApi } from '../api/users.api';
import { SchoolsApi } from '../api/schools.api';
import { AcademicApi } from '../api/academic.api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { ROLE_LABELS_AR, formatRoleLabel } from '../utils/roleLabels';
import { formatUserStatus, getUserStatusBadgeClass, formatSchoolSectionGender } from '../utils/userStatus';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Alert } from '../components/Alert';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'INACTIVE', label: 'غير نشط' },
  { value: 'SUSPENDED', label: 'معلّق' }
];

const ASSIGNABLE_ROLE_CODES = Object.keys(ROLE_LABELS_AR).filter((code) => code !== 'PLATFORM_OWNER');

export function UsersPage() {
  const navigate = useNavigate();
  const { isPlatformLevel, can } = useAuth();
  const canCreate = can(PERMISSIONS.USERS_CREATE);

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  // ─── Create User Modal ─────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newScopeKind, setNewScopeKind] = useState('SCHOOL'); // 'SCHOOL' | 'SECTION' — only relevant when a non-PLATFORM_OWNER role is selected
  const [newSchoolId, setNewSchoolId] = useState('');
  const [newSectionDivisionId, setNewSectionDivisionId] = useState('');
  const [myScopedSchools, setMyScopedSchools] = useState([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);
  const [newSections, setNewSections] = useState([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);
  const [sectionsError, setSectionsError] = useState(null);
  const newSectionsAbortRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchUsers = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const data = await UsersApi.listUsers(
        {
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          roleCode: roleFilter || undefined,
          page,
          limit
        },
        controller.signal
      );
      if (data) {
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'تعذر تحميل قائمة المستخدمين. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, roleFilter, page, limit]);

  useEffect(() => {
    fetchUsers();
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchUsers]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setStatusFilter('');
    setRoleFilter('');
    setPage(1);
  };

  const handleRowClick = (userId) => {
    navigate(`/users/${userId}`);
  };

  // ─── Create User ────────────────────────────────────────────────
  const handleOpenCreateModal = async () => {
    setModalError(null);
    setNewUsername('');
    setNewFullName('');
    setNewEmail('');
    setNewPassword('');
    setNewRoleCode('');
    setNewScopeKind('SCHOOL');
    setNewSchoolId('');
    setNewSectionDivisionId('');
    setNewSections([]);
    setSectionsError(null);
    setShowCreateModal(true);

    // Real school selector, sourced from the Schools catalog (GET /api/v1/schools).
    // The Backend scopes the result to the caller automatically: a platform-level
    // caller gets every school, a school/section-scoped caller gets only their own.
    setIsLoadingSchools(true);
    try {
      const data = await SchoolsApi.listSchools();
      const schools = data?.schools || [];
      setMyScopedSchools(schools);
      if (!isPlatformLevel && schools.length === 1) setNewSchoolId(schools[0].id);
    } catch {
      setMyScopedSchools([]);
    } finally {
      setIsLoadingSchools(false);
    }
  };

  const handleCloseCreateModal = () => {
    setNewPassword(''); // Always clear password from memory on close
    if (newSectionsAbortRef.current) newSectionsAbortRef.current.abort();
    setShowCreateModal(false);
  };

  // Loads the SchoolSection catalog for a given school (GET /api/v1/academic/sections?schoolId=X).
  // Used only when newScopeKind === 'SECTION'. Cancels any still-in-flight request
  // for a previous school before starting a new one.
  const loadSectionsForSchool = async (schoolIdValue) => {
    if (newSectionsAbortRef.current) newSectionsAbortRef.current.abort();
    if (!schoolIdValue) {
      setNewSections([]);
      setSectionsError(null);
      return;
    }
    const controller = new AbortController();
    newSectionsAbortRef.current = controller;
    setIsLoadingSections(true);
    setSectionsError(null);
    try {
      const data = await AcademicApi.listSections({ schoolId: schoolIdValue }, controller.signal);
      setNewSections(data?.sections || []);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSectionsError(err.message || 'تعذر تحميل الأقسام التعليمية لهذه المدرسة.');
        setNewSections([]);
      }
    } finally {
      setIsLoadingSections(false);
    }
  };

  // A new school selection always invalidates any previously chosen section —
  // a section from the old school must never survive into the new selection.
  const handleNewSchoolChange = (schoolIdValue) => {
    setNewSchoolId(schoolIdValue);
    setNewSectionDivisionId('');
    if (newScopeKind === 'SECTION') {
      loadSectionsForSchool(schoolIdValue);
    }
  };

  const handleNewScopeKindChange = (kind) => {
    setNewScopeKind(kind);
    setNewSectionDivisionId('');
    if (kind === 'SECTION' && newSchoolId) {
      loadSectionsForSchool(newSchoolId);
    } else {
      if (newSectionsAbortRef.current) newSectionsAbortRef.current.abort();
      setNewSections([]);
      setSectionsError(null);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newFullName.trim() || !newPassword) {
      setModalError('اسم المستخدم، الاسم الكامل، وكلمة المرور حقول إجبارية.');
      return;
    }
    if (newPassword.length < 8) {
      setModalError('كلمة المرور يجب ألا تقل عن 8 خانات.');
      return;
    }
    if (newRoleCode && newRoleCode !== 'PLATFORM_OWNER') {
      if (!newSchoolId) {
        setModalError('يجب تحديد المدرسة عند إسناد دور مبدئي لهذا المستخدم.');
        return;
      }
      if (newScopeKind === 'SECTION' && !newSectionDivisionId) {
        setModalError('يجب تحديد القسم التعليمي عند اختيار نطاق قسم محدد.');
        return;
      }
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      const payload = {
        username: newUsername.trim(),
        fullName: newFullName.trim(),
        password: newPassword,
        email: newEmail.trim() || undefined
      };
      if (newRoleCode) {
        payload.roleCode = newRoleCode;
        if (newRoleCode === 'PLATFORM_OWNER') {
          payload.scopeType = 'PLATFORM';
        } else if (newScopeKind === 'SECTION') {
          payload.scopeType = 'SECTION';
          payload.schoolId = newSchoolId;
          payload.sectionDivisionId = newSectionDivisionId;
        } else {
          payload.scopeType = 'SCHOOL';
          payload.schoolId = newSchoolId;
        }
      }

      const result = await UsersApi.createUser(payload);
      setNewPassword('');
      setShowCreateModal(false);
      if (result?.user?.id) {
        navigate(`/users/${result.user.id}`);
      } else {
        fetchUsers();
      }
    } catch (err) {
      setModalError(err.message || 'فشل إنشاء المستخدم.');
    } finally {
      setNewPassword('');
      setIsSubmitting(false);
    }
  };

  // Proactively mirrors the same rules handleCreateUser enforces on submit,
  // so the button is disabled before the user even tries — no schoolId for a
  // scoped role, or (for SECTION) no sectionDivisionId / sections still
  // loading / a section-fetch error that prevents confirming the selection.
  const isRoleScopeIncomplete =
    Boolean(newRoleCode) &&
    newRoleCode !== 'PLATFORM_OWNER' &&
    (!newSchoolId ||
      (newScopeKind === 'SECTION' &&
        (isLoadingSections || Boolean(sectionsError) || !newSectionDivisionId)));

  return (
    <div className="users-page-container">
      <div className="page-header-row">
        <div className="page-title-group">
          <h2 className="page-title">إدارة المستخدمين والصلاحيات</h2>
          <span className="page-subtitle">استعراض حسابات المستخدمين وإدارة أدوارهم ونطاقاتهم الإدارية</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <div className="badge badge-primary" style={{ padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
            إجمالي المستخدمين: <strong>{total}</strong>
          </div>
          {canCreate && (
            <button type="button" className="btn-action-primary" onClick={handleOpenCreateModal}>
              <span>+</span>
              <span>إنشاء مستخدم جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="ابحث بالاسم، اسم المستخدم، أو البريد الإلكتروني..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="البحث عن مستخدم"
            />
          </div>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="تصفية حسب الحالة"
          >
            <option value="">جميع الحالات</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            aria-label="تصفية حسب الدور"
          >
            <option value="">جميع الأدوار</option>
            {Object.keys(ROLE_LABELS_AR).map((code) => (
              <option key={code} value={code}>{formatRoleLabel(code)}</option>
            ))}
          </select>

          {(searchTerm || statusFilter || roleFilter) && (
            <button type="button" className="btn-reset-filters" onClick={handleResetFilters}>
              إعادة ضبط التصفية
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert type="error" message={error}>
          <button type="button" className="btn-reset-filters" onClick={fetchUsers} style={{ marginRight: 'var(--spacing-3)' }}>
            إعادة المحاولة
          </button>
        </Alert>
      )}

      {/* Users Table */}
      <div className="table-container">
        {isLoading ? (
          <LoadingSpinner text="جاري تحميل المستخدمين..." />
        ) : users.length === 0 ? (
          <div className="placeholder-page" style={{ minHeight: '260px' }}>
            <div className="placeholder-icon">👥</div>
            <h3 className="placeholder-title">لا توجد بيانات مستخدمين مطابقة</h3>
            <p className="placeholder-desc">لم يتم العثور على أي نتائج تطابق معايير البحث أو التصفية الحالية.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>اسم المستخدم</th>
                  <th>الاسم الكامل</th>
                  <th>الحالة</th>
                  <th>الأدوار المسندة</th>
                  <th>آخر دخول</th>
                  <th>تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} onClick={() => handleRowClick(u.id)} title="انقر لعرض الملف التفصيلي للمستخدم">
                    <td><code style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{u.username}</code></td>
                    <td>
                      <strong>{u.fullName}</strong>
                      {u.email && (
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{u.email}</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${getUserStatusBadgeClass(u.status)}`}>{formatUserStatus(u.status)}</span>
                    </td>
                    <td>
                      {u.roleAssignments && u.roleAssignments.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {u.roleAssignments.map((a) => (
                            <span key={a.id} className="badge badge-primary">
                              {a.role?.nameAr || formatRoleLabel(a.role?.code)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>بدون دور</span>
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--font-size-xs)' }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) : 'لم يسجّل الدخول بعد'}
                    </td>
                    <td style={{ fontSize: 'var(--font-size-xs)' }}>
                      {new Date(u.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && users.length > 0 && (
        <div className="pagination-bar">
          <span className="pagination-info">
            عرض الصفحة <strong>{page}</strong> من <strong>{totalPages}</strong> (إجمالي النتائج: {total})
          </span>
          <div className="pagination-actions">
            <button type="button" className="btn-page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</button>
            <button type="button" className="btn-page" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>التالي</button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h4 className="modal-title">إنشاء مستخدم جديد</h4>
              <button type="button" className="back-link-btn" style={{ margin: 0 }} onClick={handleCloseCreateModal} disabled={isSubmitting}>✕</button>
            </div>
            <form onSubmit={handleCreateUser} autoComplete="off">
              <div className="modal-body">
                {modalError && <Alert type="error" message={modalError} />}

                <div className="modal-form-grid" style={{ marginBottom: 'var(--spacing-4)' }}>
                  <div className="form-group">
                    <label className="form-label">اسم المستخدم *</label>
                    <input type="text" className="form-input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoComplete="off" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">الاسم الكامل *</label>
                    <input type="text" className="form-input" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} required />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="form-label">البريد الإلكتروني (اختياري)</label>
                  <input type="email" className="form-input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="off" />
                </div>

                <div className="action-info-box">
                  🔒 كلمة المرور لا تُحفظ في الواجهة ولا تُعرض بعد الإنشاء — يرجى تسليمها للمستخدم بقناة آمنة.
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
                  <label className="form-label">كلمة المرور الابتدائية * <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>(8 خانات على الأقل)</span></label>
                  <input type="password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
                </div>

                <div className="form-group" style={{ marginBottom: newRoleCode && newRoleCode !== 'PLATFORM_OWNER' ? 'var(--spacing-4)' : 0 }}>
                  <label className="form-label">الدور المبدئي (اختياري)</label>
                  <select className="filter-select" style={{ width: '100%' }} value={newRoleCode} onChange={(e) => setNewRoleCode(e.target.value)}>
                    <option value="">-- بدون دور مبدئي --</option>
                    {(isPlatformLevel ? ['PLATFORM_OWNER', ...ASSIGNABLE_ROLE_CODES] : ASSIGNABLE_ROLE_CODES).map((code) => (
                      <option key={code} value={code}>{formatRoleLabel(code)}</option>
                    ))}
                  </select>
                </div>

                {newRoleCode && newRoleCode !== 'PLATFORM_OWNER' && (
                  <>
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
                      <label className="form-label">نطاق الإسناد *</label>
                      <select
                        className="filter-select"
                        style={{ width: '100%' }}
                        value={newScopeKind}
                        onChange={(e) => handleNewScopeKindChange(e.target.value)}
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
                          <select className="filter-select" style={{ width: '100%' }} value={newSchoolId} onChange={(e) => handleNewSchoolChange(e.target.value)} required>
                            <option value="">-- اختر المدرسة --</option>
                            {myScopedSchools.map((s) => (
                              <option key={s.id} value={s.id} disabled={s.isActive === false}>
                                {s.nameAr}{s.isActive === false ? ' (غير نشطة)' : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {newScopeKind === 'SECTION' && (
                        <div className="form-group">
                          <label className="form-label">القسم التعليمي *</label>
                          {!newSchoolId ? (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>اختر المدرسة أولاً</span>
                          ) : isLoadingSections ? (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>جاري تحميل الأقسام...</span>
                          ) : sectionsError ? (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>{sectionsError}</span>
                          ) : newSections.length === 0 ? (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>لا توجد أقسام تعليمية مسجلة لهذه المدرسة.</span>
                          ) : (
                            <select className="filter-select" style={{ width: '100%' }} value={newSectionDivisionId} onChange={(e) => setNewSectionDivisionId(e.target.value)} required>
                              <option value="">-- اختر القسم --</option>
                              {newSections.map((s) => (
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

                {newRoleCode === 'PLATFORM_OWNER' && isPlatformLevel && (
                  <div className="action-warning-box" style={{ marginTop: 'var(--spacing-4)', marginBottom: 0 }}>
                    ⚠️ سيتم منح هذا المستخدم صلاحيات مالك المنصة الكاملة (نطاق المنصة العام).
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-action-secondary" onClick={handleCloseCreateModal} disabled={isSubmitting}>إلغاء</button>
                <button type="submit" className="btn-action-primary" disabled={isSubmitting || isRoleScopeIncomplete}>
                  {isSubmitting ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
