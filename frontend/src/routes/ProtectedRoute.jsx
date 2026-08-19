import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function ProtectedRoute({ requiredPermission = null }) {
  const { isAuthenticated, isLoading, can } = useAuth();
  const location = useLocation();

  // 1. Session verification in progress -> show clean full screen spinner (no flash of protected page)
  if (isLoading) {
    return <LoadingSpinner fullScreen text="التحقق من حالة الجلسة..." />;
  }

  // 2. Unauthenticated -> redirect to login with return path
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Permission evaluation
  if (requiredPermission && !can(requiredPermission)) {
    return (
      <div className="placeholder-page">
        <div className="placeholder-icon" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
          ⛔
        </div>
        <h2 className="placeholder-title">غير مصرح بالوصول</h2>
        <p className="placeholder-desc">
          عذراً، حسابك لا يمتلك الصلاحية المطلوبة للوصول إلى هذا القسم.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
