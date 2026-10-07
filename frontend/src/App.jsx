import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import RecruiterDashboard from './pages/RecruiterDashboard.jsx';
import CandidateDashboard from './pages/CandidateDashboard.jsx';
import InterviewRoomPage from './pages/InterviewRoomPage.jsx';
import InterviewDetailPage from './pages/InterviewDetailPage.jsx';

// Root redirector based on authenticated user's role
const RootRedirect = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return user.role === 'RECRUITER' ? (
    <Navigate to="/recruiter" replace />
  ) : (
    <Navigate to="/candidate" replace />
  );
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected Recruiter Routes */}
          <Route
            path="/recruiter/interviews/:id"
            element={
              <ProtectedRoute requiredRole="RECRUITER">
                <InterviewDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recruiter/*"
            element={
              <ProtectedRoute requiredRole="RECRUITER">
                <RecruiterDashboard />
              </ProtectedRoute>
            }
          />

          {/* Protected Candidate Routes */}
          <Route
            path="/candidate"
            element={
              <ProtectedRoute requiredRole="CANDIDATE">
                <CandidateDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/candidate/interview/:id/room"
            element={
              <ProtectedRoute requiredRole="CANDIDATE">
                <InterviewRoomPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback & Root */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
