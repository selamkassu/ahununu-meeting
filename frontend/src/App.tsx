import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { AlertProvider } from "./components/ui/AlertDialog";
import { AppLayout } from "./components/layout/AppLayout";

import Login from "./pages/Login";
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
import RolesPage from "./pages/roles/RolesPage";
import DocumentsPage from "./pages/DocumentsPage";
import NotificationsPage from "./pages/NotificationsPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AlertProvider>
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/meetings" element={<MeetingList />} />
              <Route path="/meetings/:id" element={<MeetingDetail />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/agenda" element={<AgendaOverviewPage />} />
              <Route path="/minutes" element={<MinutesOverviewPage />} />
              <Route path="/decisions" element={<DecisionsPage />} />
              <Route path="/action-items" element={<ActionItemsPage />} />
              <Route path="/action-items/:id" element={<ActionItemsPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AlertProvider>
      </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
