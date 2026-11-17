import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './components/shared/Toast.jsx';
import ProtectedRoute from './components/shared/ProtectedRoute.jsx';
import Navbar from './components/layout/Navbar.jsx';
import HomePage from './pages/HomePage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Routes>
            {/* ── Fully public ── */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* ── Requires JWT but NOT email verification ── */}
            {/* (user is logged in but may not have verified yet) */}
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* ── Requires JWT + verified email ── */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Navbar />
                  <main className="flex-1">
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/projects/:projectId" element={<ProjectPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}
