import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Wraps any dashboard route that requires:
 *   1. A valid JWT (authenticated)
 *   2. Email verified (isVerified: true)
 *
 * States:
 *   loading          → show spinner (token being verified with /me)
 *   not authenticated → redirect to /login
 *   authenticated + not verified → redirect to /verify-email
 *   authenticated + verified     → render children ✓
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin w-8 h-8 text-brand-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-gray-500">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Authenticated but email not verified → send to verification page
  if (!user?.isVerified) return <Navigate to="/verify-email" replace />;

  return children;
}
