import React from 'react';

export function PlaceholderPage({ title, description, icon = '📋' }) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-icon">{icon}</div>
      <h2 className="placeholder-title">{title}</h2>
      <p className="placeholder-desc">{description}</p>
      <span className="badge badge-primary" style={{ padding: '6px 14px', fontSize: 'var(--font-size-sm)' }}>
        طبقة الـ Backend API مكتملة ومختبرة &bull; جاري بناء واجهة المستخدم في المراحل التالية
      </span>
    </div>
  );
}
