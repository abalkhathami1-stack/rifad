import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Navbar } from '../components/Navbar';

export function MainLayout() {
  const location = useLocation();

  const getPageTitle = (pathname) => {
    switch (pathname) {
      case '/dashboard':
        return 'لوحة التحكم الرئيسية';
      case '/students':
        return 'إدارة شؤون الطلاب';
      case '/teachers':
        return 'إدارة الهيئة التعليمية';
      case '/guardians':
        return 'إدارة أولياء الأمور';
      case '/academic':
        return 'الهيكل الأكاديمي والفصول';
      case '/import':
        return 'محرك استيراد البيانات';
      case '/promotion':
        return 'الترفيع والترحيل السنوي';
      case '/users':
        return 'إدارة المستخدمين والصلاحيات';
      default:
        if (pathname.startsWith('/students/')) {
          return 'الملف الشامل للطالب';
        }
        if (pathname.startsWith('/teachers/')) {
          return 'الملف الشامل للمعلم';
        }
        if (pathname.startsWith('/guardians/')) {
          return 'الملف الشامل لولي الأمر';
        }
        return 'منصة رِفاد';
    }
  };

  const title = getPageTitle(location.pathname);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-wrapper">
        <Navbar title={title} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
