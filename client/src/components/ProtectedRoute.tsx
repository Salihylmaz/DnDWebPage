import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/**
 * Wraps a route that requires authentication.
 * While auth state is loading (first page load, checking cookie),
 * shows nothing to avoid a flash of the login page.
 * Once resolved: redirects to /login if not authenticated.
 */
export function ProtectedRoute({ children }: Props) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-dragon-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    // Save the attempted URL so we can redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
