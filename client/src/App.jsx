import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { DashboardProvider } from './contexts/DashboardContext';
import Login from './pages/Login';
import Register from './pages/Register';
import HomePage from './pages/HomePage';
import AppLayout from './layouts/AppLayout';
import MyRequestsPage from './pages/app/MyRequestsPage';
import InboxPage from './pages/app/InboxPage';
import AdminOverviewPage from './pages/app/AdminOverviewPage';
import UserManagementPage from './pages/app/UserManagementPage';
import ManagerRequestsPage from './pages/app/ManagerRequestsPage';
import RequestManagerPage from './pages/app/RequestManagerPage';
import './App.css';

function PublicHomeRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-base)] text-[var(--text-1)]">
        <span className="spinner w-8 h-8" style={{ width: 32, height: 32, borderWidth: 3 }} aria-hidden />
        <p className="text-[var(--text-2)] font-medium mt-4">Loading session…</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/app/my-requests" replace />;
  }

  return <HomePage />;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-base)] text-[var(--text-1)]">
        <span className="spinner w-8 h-8" style={{ width: 32, height: 32, borderWidth: 3 }} aria-hidden />
        <p className="text-[var(--text-2)] font-medium mt-4">Loading session…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/app/my-requests" replace />;
  }
  return children;
}

function RequestManagerGate({ children }) {
  const { user } = useAuth();
  if (user?.managerId) {
    return <Navigate to="/app/my-requests" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/" element={<PublicHomeRoute />} />

          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <DashboardProvider>
                  <AppLayout />
                </DashboardProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="my-requests" replace />} />
            <Route path="my-requests" element={<MyRequestsPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <AdminOverviewPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/users"
              element={
                <AdminRoute>
                  <UserManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/manager-requests"
              element={
                <AdminRoute>
                  <ManagerRequestsPage />
                </AdminRoute>
              }
            />
            <Route
              path="request-manager"
              element={
                <RequestManagerGate>
                  <RequestManagerPage />
                </RequestManagerGate>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
