import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthApi } from '../api/auth.api';
import { hasPermission } from '../utils/rbac';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [isPlatformLevel, setIsPlatformLevel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  /**
   * Initializes session on application startup by querying GET /api/v1/auth/me
   */
  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setAuthError(null);
      const data = await AuthApi.getMe();
      if (data && data.user) {
        setUser(data.user);
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
        setScopes(data.scopes || []);
        setIsPlatformLevel(Boolean(data.isPlatformLevel));
      } else {
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setScopes([]);
        setIsPlatformLevel(false);
      }
    } catch {
      // 401 or network failure -> unauthenticated state (clean, no error display needed on initial load)
      setUser(null);
      setRoles([]);
      setPermissions([]);
      setScopes([]);
      setIsPlatformLevel(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  /**
   * Authenticates user and sets React state from backend response
   */
  const login = async (username, password) => {
    setAuthError(null);
    try {
      const data = await AuthApi.login(username, password);
      setUser(data.user);
      setRoles(data.roles || []);
      setPermissions(data.permissions || []);
      setScopes(data.scopes || []);
      
      const isPlatform = (data.roles || []).some(
        (r) => r.code === 'PLATFORM_OWNER'
      ) || (data.scopes || []).some((s) => s.scopeType === 'PLATFORM');
      
      setIsPlatformLevel(isPlatform);
      return data;
    } catch (err) {
      setAuthError(err.message || 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      throw err;
    }
  };

  /**
   * Logs out user, invalidates session in backend, and resets state
   */
  const logout = async () => {
    try {
      await AuthApi.logout();
    } catch {
      // Ignore network errors during logout to allow local reset
    } finally {
      setUser(null);
      setRoles([]);
      setPermissions([]);
      setScopes([]);
      setIsPlatformLevel(false);
      setAuthError(null);
    }
  };

  /**
   * Evaluates if current user possesses a specific permission code.
   * Strictly evaluates the permissions array received from backend.
   * Zero role, scope, or platform-level bypass.
   */
  const can = useCallback((permissionCode) => {
    return hasPermission(permissions, permissionCode);
  }, [permissions]);

  /**
   * Checks if current user has a specific role code.
   * Evaluates only the explicit roles array.
   */
  const hasRole = useCallback((roleCode) => {
    if (!roleCode || !Array.isArray(roles)) return false;
    return roles.some((r) => r.code === roleCode);
  }, [roles]);

  const value = {
    user,
    roles,
    permissions,
    scopes,
    isPlatformLevel,
    isAuthenticated: Boolean(user),
    isLoading,
    authError,
    login,
    logout,
    can,
    hasRole,
    refreshSession: checkSession
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
