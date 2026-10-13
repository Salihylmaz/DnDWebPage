import {
  createContext,
  useContext,
  ReactNode,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { User } from '@dnd/shared';
import { authApi, type LoginPayload, type RegisterPayload } from '../lib/api';

// ── Context ───────────────────────────────────────────────────────────────────
interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (data: LoginPayload) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // /api/auth/me is our source of truth for "is the user logged in?"
  // staleTime: Infinity means we never refetch unless we explicitly invalidate.
  const { data: user = null, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    staleTime: Infinity,
    retry: false, // 401 means logged out — no need to retry
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (userData) => {
      queryClient.setQueryData(['auth', 'me'], userData);
      navigate('/dashboard');
    },
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (userData) => {
      queryClient.setQueryData(['auth', 'me'], userData);
      navigate('/dashboard');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear(); // clear all cached data on logout
      navigate('/login');
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login: async (data) => { await loginMutation.mutateAsync(data); },
        register: async (data) => { await registerMutation.mutateAsync(data); },
        logout: async () => { await logoutMutation.mutateAsync(); },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
