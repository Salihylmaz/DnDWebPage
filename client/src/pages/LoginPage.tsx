import { useCallback, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

function safeReturnPath(pathname: unknown): string {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) {
    return '/dashboard';
  }
  return pathname;
}

export default function LoginPage() {
  const { login, googleLogin, resendVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeReturnPath((location.state as { from?: { pathname?: unknown } } | null)?.from?.pathname);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await googleLogin(credential);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google ile giriş yapılamadı');
    } finally {
      setLoading(false);
    }
  }, [googleLogin, navigate, from]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setCanResendVerification(false);
    setLoading(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
      setCanResendVerification((err as { status?: number })?.status === 403);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    setNotice('');
    try {
      const result = await resendVerification(email);
      setNotice(result.message);
      setCanResendVerification(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'E-posta gönderilemedi');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {/* Background glow effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-dragon-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="text-5xl">⚔️</span>
          <h1 className="mt-3 text-2xl font-bold text-white">DnD Session Manager</h1>
          <p className="mt-1 text-sm text-gray-400">Macerana devam et</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-white">Giriş Yap</h2>
          <p className="mb-5 mt-1 text-sm text-gray-400">Macerana kaldığın yerden devam et.</p>

          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading} />

          {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <div className="my-5 flex items-center gap-3 text-xs text-gray-500" aria-hidden="true">
              <span className="h-px flex-1 bg-white/10" />
              <span>veya e-posta ile giriş yap</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300" htmlFor="login-email">
                E-posta
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="dungeon@master.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300" htmlFor="login-password">
                Şifre
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            {notice && <p className="text-sm text-emerald-300" role="status">{notice}</p>}

            {canResendVerification && (
              <button type="button" onClick={handleResendVerification} className="text-sm text-dragon-400 hover:text-dragon-300">
                Doğrulama e-postasını yeniden gönder
              </button>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Giriş yapılıyor...
                </>
              ) : (
                'Giriş Yap'
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-400">
          Hesabın yok mu?{' '}
          <Link to="/register" className="font-medium text-dragon-400 hover:text-dragon-300 transition-colors">
            Kayıt ol
          </Link>
        </p>
      </div>
    </div>
  );
}
