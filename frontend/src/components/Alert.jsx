import React from 'react';

export function Alert({ type = 'error', message, children }) {
  if (!message && !children) return null;

  return (
    <div className={`alert alert-${type}`} role="alert">
      <span>{message || children}</span>
    </div>
  );
}
