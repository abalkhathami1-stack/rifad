import React from 'react';
import { NavLink } from 'react-router-dom';

export function AcademicNav() {
  const tabs = [
    { to: '/academic', label: '📊 نظرة عامة', end: true },
    { to: '/academic/years', label: '📅 السنوات والفصول الدراسية' },
    { to: '/academic/stages', label: '🏫 المراحل والصفوف' },
    { to: '/academic/classes', label: '👥 الشعب الصفية' },
    { to: '/academic/subjects', label: '📖 المواد الدراسية' },
    { to: '/academic/sections', label: '🏢 الأقسام التعليمية' }
  ];

  return (
    <nav className="academic-nav-tabs" aria-label="أقسام الهيكل الأكاديمي">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `academic-tab-btn ${isActive ? 'active' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
