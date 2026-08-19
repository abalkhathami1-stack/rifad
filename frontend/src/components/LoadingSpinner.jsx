import React from 'react';

export function LoadingSpinner({ text = 'جاري التحميل...', fullScreen = false }) {
  if (fullScreen) {
    return (
      <div className="spinner-container spinner-fullscreen">
        <div className="spinner" />
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          {text}
        </span>
      </div>
    );
  }

  return (
    <div className="spinner-container">
      <div className="spinner" />
      {text && (
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          {text}
        </span>
      )}
    </div>
  );
}
