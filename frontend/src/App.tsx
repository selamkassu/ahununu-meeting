import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { AlertProvider } from "./components/ui/AlertDialog";
import { AppLayout } from "./components/layout/AppLayout";
import { GoogleOAuthProvider } from "@react-oauth/google";

import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import MeetingList from "./pages/meetings/MeetingList";
import MeetingDetail from "./pages/meetings/MeetingDetail";
import CalendarPage from "./pages/CalendarPage";
import AgendaOverviewPage from "./pages/AgendaOverviewPage";
import MinutesOverviewPage from "./pages/MinutesOverviewPage";
import DecisionsPage from "./pages/DecisionsPage";
import ActionItemsPage from "./pages/actionitems/ActionItemsPage";
import DepartmentsPage from "./pages/departments/DepartmentsPage";
import UsersPage from "./pages/users/UsersPage";
import UserApprovalsPage from "./pages/users/UserApprovalsPage";
import RolesPage from "./pages/roles/RolesPage";
import DocumentsPage from "./pages/DocumentsPage";
import NotificationsPage from "./pages/NotificationsPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";

import { ProtectedRoute, DashboardGate } from "./components/auth/ProtectedRoute";

function GoogleWrapper({ children }: { children: React.ReactNode }) {
  const { googleClientId, isGoogleConfigured } = useAuth();
  if (isGoogleConfigured && googleClientId && googleClientId.length > 10 && !googleClientId.includes("your-google")) {
    return <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GoogleWrapper>
          <NotificationProvider>
            <AlertProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route element={<AppLayout />}>
                  <Route
                    path="/"
                    element={
                      <DashboardGate>
                        <Dashboard />
                      </DashboardGate>
                    }
                  />
                  <Route
                    path="/meetings"
                    element={
                      <ProtectedRoute permission="meetings:view" resourceName="Meetings Directory">
                        <MeetingList />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/meetings/:id"
                    element={
                      <ProtectedRoute permission="meetings:view" resourceName="Meeting Details">
                        <MeetingDetail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/calendar"
                    element={
                      <ProtectedRoute permission="meetings:view" resourceName="Calendar">
                        <CalendarPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/agenda"
                    element={
                      <ProtectedRoute permission="agenda:view" resourceName="Agenda Overview">
                        <AgendaOverviewPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/minutes"
                    element={
                      <ProtectedRoute permission="minutes:view" resourceName="Meeting Minutes">
                        <MinutesOverviewPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/decisions"
                    element={
                      <ProtectedRoute permission="decisions:view" resourceName="Decisions Registry">
                        <DecisionsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/action-items"
                    element={
                      <ProtectedRoute permission="action_items:view" resourceName="Action & Accountability">
                        <ActionItemsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/action-items/:id"
                    element={
                      <ProtectedRoute permission="action_items:view" resourceName="Action Item Details">
                        <ActionItemsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/departments"
                    element={
                      <ProtectedRoute permission="departments:view" resourceName="Departments">
                        <DepartmentsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute permission="users:view" resourceName="User Management">
                        <UsersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/user-approvals"
                    element={
                      <ProtectedRoute permission="users:approve" resourceName="User Approvals">
                        <UserApprovalsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/user-approvals"
                    element={
                      <ProtectedRoute permission="users:approve" resourceName="User Approvals">
                        <UserApprovalsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/roles"
                    element={
                      <ProtectedRoute permission="roles:view" resourceName="Role Management">
                        <RolesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/documents"
                    element={
                      <ProtectedRoute permission="documents:view" resourceName="Documents Archive">
                        <DocumentsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <ProtectedRoute permission="notifications:view" resourceName="Notifications">
                        <NotificationsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <ProtectedRoute permission="reports:view" resourceName="Reports & Analytics">
                        <ReportsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute permission="settings:view" resourceName="System Settings">
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AlertProvider>
          </NotificationProvider>
        </GoogleWrapper>
      </AuthProvider>
    </BrowserRouter>
  );
}
