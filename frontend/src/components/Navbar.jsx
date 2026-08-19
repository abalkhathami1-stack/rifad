import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatPrimaryRoleLabel } from '../utils/roleLabels';

export function Navbar({ title = 'لوحة التحكم' }) {
  const { user, roles, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const primaryRole = formatPrimaryRoleLabel(roles, '');

  return (
    <header className="top-header">
      <div className="header-title-section">
        <h1 className="header-title">{title}</h1>
        {primaryRole && (
          <span className="badge badge-primary">
            {primaryRole}
          </span>
        )}
      </div>

      <div className="header-actions">
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          مرحباً، <strong>{user?.fullName || user?.username}</strong>
        </span>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="btn-logout"
          title="تسجيل الخروج من النظام"
        >
          <span>{isLoggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</span>
        </button>
      </div>
    </header>
  );
}
