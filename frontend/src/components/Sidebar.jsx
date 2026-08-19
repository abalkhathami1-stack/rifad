import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { formatPrimaryRoleLabel } from '../utils/roleLabels';

export function Sidebar() {
  const { user, roles, can } = useAuth();

  const navItems = [
    {
      to: '/dashboard',
      label: 'لوحة التحكم',
      permission: null, // Always visible to authenticated users
      icon: '📊'
    },
    {
      to: '/students',
      label: 'شؤون الطلاب',
      permission: PERMISSIONS.STUDENTS_VIEW,
      icon: '🎓'
    },
    {
      to: '/teachers',
      label: 'الهيئة التعليمية',
      permission: PERMISSIONS.TEACHERS_VIEW,
      icon: '👨‍🏫'
    },
    {
      to: '/guardians',
      label: 'أولياء الأمور',
      permission: PERMISSIONS.GUARDIANS_VIEW,
      icon: '👨‍👩‍👧'
    },
    {
      to: '/academic',
      label: 'الهيكل الأكاديمي',
      permission: PERMISSIONS.ACADEMIC_VIEW,
      icon: '🏫'
    },
    {
      to: '/import',
      label: 'محرك الاستيراد',
      permission: PERMISSIONS.IMPORT_VIEW,
      icon: '📥'
    },
    {
      to: '/promotion',
      label: 'الترفيع والترحيل',
      permission: PERMISSIONS.PROMOTION_VIEW,
      icon: '🔄'
    },
    {
      to: '/users',
      label: 'إدارة المستخدمين',
      permission: PERMISSIONS.USERS_VIEW,
      icon: '👥'
    }
  ];

  // Filter items based on user's active permissions
  const visibleNavItems = navItems.filter((item) => {
    if (!item.permission) return true;
    return can(item.permission);
  });

  const primaryRole = formatPrimaryRoleLabel(roles, 'مستخدم');
  const initialLetter = user?.fullName ? user.fullName.trim().charAt(0) : 'ر';

  return (
    <aside className="sidebar" aria-label="شريط التنقل الجانبي">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand-icon">ر</div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-title">رِفاد RIFAD</span>
          <span className="sidebar-brand-subtitle">منصة الإدارة المدرسية</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        <div className="nav-section-title">القائمة الرئيسية</div>
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User Mini Profile in Sidebar Footer */}
      <div className="sidebar-footer">
        <div className="user-profile-badge">
          <div className="user-avatar">{initialLetter}</div>
          <div className="user-info">
            <span className="user-name" title={user?.fullName || user?.username}>
              {user?.fullName || user?.username}
            </span>
            <span className="user-role" title={primaryRole}>
              {primaryRole}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
