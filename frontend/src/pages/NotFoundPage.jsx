import React from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="placeholder-page" style={{ margin: 'var(--spacing-12) auto', maxWidth: '600px' }}>
      <div className="placeholder-icon" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
        404
      </div>
      <h2 className="placeholder-title">الصفحة غير موجودة</h2>
      <p className="placeholder-desc">
        عذراً، المسار الذي تحاول الوصول إليه غير موجود أو تم نقله.
      </p>
      <Link to="/dashboard" className="btn-primary" style={{ display: 'inline-flex', width: 'auto', padding: '10px 24px' }}>
        العودة إلى لوحة التحكم
      </Link>
    </div>
  );
}
