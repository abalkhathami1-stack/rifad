import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // If already authenticated, redirect to dashboard immediately
  if (isLoading) {
    return <LoadingSpinner fullScreen text="التحقق من حالة الجلسة..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!username.trim() || !password) {
      setErrorMessage('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }

    setIsSubmitting(true);

    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo-badge">ر</div>
        <h2 className="auth-title">رِفاد RIFAD</h2>
        <p className="auth-subtitle">منصة الإدارة المدرسية الموحدة — مدارس الرياض</p>
      </div>

      <Alert type="error" message={errorMessage} />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="username">
            اسم المستخدم
          </label>
          <input
            id="username"
            type="text"
            className="form-input"
            placeholder="أدخل اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isSubmitting}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="password">
            كلمة المرور
          </label>
          <input
            id="password"
            type="password"
            className="form-input"
            placeholder="أدخل كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <div className="spinner spinner-sm" />
              <span>جاري التحقق...</span>
            </>
          ) : (
            <span>تسجيل الدخول</span>
          )}
        </button>
      </form>

      <div className="auth-footer">
        نظام رِفاد الداخلي &bull; جميع الحقوق محفوظة لمدارس الرياض
      </div>
    </div>
  );
}
