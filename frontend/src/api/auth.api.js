import { apiClient } from './client';

/**
 * Authentication API Service
 */
export const AuthApi = {
  /**
   * Authenticates user with credentials and receives HttpOnly session cookie
   */
  async login(username, password) {
    const res = await apiClient('/auth/login', {
      method: 'POST',
      body: { username: username.trim(), password }
    });
    return res.data;
  },

  /**
   * Validates active session and retrieves user profile, roles, and permissions
   */
  async getMe() {
    const res = await apiClient('/auth/me', {
      method: 'GET'
    });
    return res.data;
  },

  /**
   * Revokes current session and clears HttpOnly session cookie
   */
  async logout() {
    const res = await apiClient('/auth/logout', {
      method: 'POST'
    });
    return res.data;
  }
};
