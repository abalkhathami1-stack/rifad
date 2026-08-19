import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { MainLayout } from '../layouts/MainLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { StudentsPage } from '../pages/StudentsPage';
import { StudentDetailsPage } from '../pages/StudentDetailsPage';
import { TeachersPage } from '../pages/TeachersPage';
import { TeacherDetailsPage } from '../pages/TeacherDetailsPage';
import { GuardiansPage } from '../pages/GuardiansPage';
import { GuardianDetailsPage } from '../pages/GuardianDetailsPage';
import { AcademicPage } from '../pages/AcademicPage';
import { AcademicYearsPage } from '../pages/AcademicYearsPage';
import { AcademicStagesPage } from '../pages/AcademicStagesPage';
import { AcademicClassesPage } from '../pages/AcademicClassesPage';
import { AcademicSubjectsPage } from '../pages/AcademicSubjectsPage';
import { AcademicSectionsPage } from '../pages/AcademicSectionsPage';
import { ImportPage } from '../pages/ImportPage';
import { ImportBatchPage } from '../pages/ImportBatchPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PERMISSIONS } from '../constants/permissions';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Authentication Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Protected Main Application Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          {/* Default redirect to Dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* Main Dashboard */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Students Domain Routes (Protected by STUDENTS_VIEW) */}
          <Route element={<ProtectedRoute requiredPermission={PERMISSIONS.STUDENTS_VIEW} />}>
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:id" element={<StudentDetailsPage />} />
          </Route>

          {/* Teachers Domain Routes (Protected by TEACHERS_VIEW) */}
          <Route element={<ProtectedRoute requiredPermission={PERMISSIONS.TEACHERS_VIEW} />}>
            <Route path="/teachers" element={<TeachersPage />} />
            <Route path="/teachers/:id" element={<TeacherDetailsPage />} />
          </Route>

          {/* Guardians Domain Routes (Protected by GUARDIANS_VIEW) */}
          <Route element={<ProtectedRoute requiredPermission={PERMISSIONS.GUARDIANS_VIEW} />}>
            <Route path="/guardians" element={<GuardiansPage />} />
            <Route path="/guardians/:id" element={<GuardianDetailsPage />} />
          </Route>

          {/* Academic Domain Routes (Protected by ACADEMIC_VIEW) */}
          <Route element={<ProtectedRoute requiredPermission={PERMISSIONS.ACADEMIC_VIEW} />}>
            <Route path="/academic" element={<AcademicPage />} />
            <Route path="/academic/years" element={<AcademicYearsPage />} />
            <Route path="/academic/stages" element={<AcademicStagesPage />} />
            <Route path="/academic/classes" element={<AcademicClassesPage />} />
            <Route path="/academic/subjects" element={<AcademicSubjectsPage />} />
            <Route path="/academic/sections" element={<AcademicSectionsPage />} />
          </Route>

          {/* Import Engine Domain Routes (Protected by IMPORT_VIEW) */}
          <Route element={<ProtectedRoute requiredPermission={PERMISSIONS.IMPORT_VIEW} />}>
            <Route path="/import" element={<ImportPage />} />
            <Route path="/import/:batchId" element={<ImportBatchPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission={PERMISSIONS.PROMOTION_VIEW} />}>
            <Route
              path="/promotion"
              element={
                <PlaceholderPage
                  title="الترفيع والترحيل السنوي"
                  description="إنشاء دفعات الترفيع، توليد القرارات آلياً، والترحيل للعام الدراسي التالي."
                  icon="🔄"
                />
              }
            />
          </Route>

          <Route element={<ProtectedRoute requiredPermission={PERMISSIONS.USERS_VIEW} />}>
            <Route
              path="/users"
              element={
                <PlaceholderPage
                  title="إدارة المستخدمين والصلاحيات"
                  description="إدارة حسابات المستخدمين، إسناد الأدوار، وتحديد النطاقات الإدارية."
                  icon="👥"
                />
              }
            />
          </Route>
        </Route>
      </Route>

      {/* 404 Catch-All Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
