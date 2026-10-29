import { useCallback, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

export default function RegisterPage() {
  const { register, googleLogin } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await googleLogin(credential);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google ile kayıt yapılamadı');
    } finally {
      setLoading(false);
    }
  }, [googleLogin]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const result = await register({ displayName, email, password });
      setNotice(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-dragon-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="text-5xl">🐉</span>
          <h1 className="mt-3 text-2xl font-bold text-white">DnD Session Manager</h1>
          <p className="mt-1 text-sm text-gray-400">Maceraya başla</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-white">Yeni hesap oluştur</h2>
          <p className="mb-5 mt-1 text-sm text-gray-400">E-posta adresini doğrulaman gerekecek.</p>

          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading} />

          {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <div className="my-5 flex items-center gap-3 text-xs text-gray-500" aria-hidden="true">
              <span className="h-px flex-1 bg-white/10" />
              <span>veya e-posta ile kayıt ol</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" id="register-form">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300" htmlFor="register-name">
                Kullanıcı Adı
              </label>
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={50}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input"
                placeholder="Dungeon Master"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300" htmlFor="register-email">
                E-posta
              </label>
              <input
                id="register-email"
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
              <label className="mb-1.5 block text-sm font-medium text-gray-300" htmlFor="register-password">
                Şifre
              </label>
              <input
                id="register-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="En az 8 karakter"
              />
              <p className="mt-1 text-xs text-gray-500">En az 12 karakter</p>
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            {notice && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">{notice}</p>}

            <button
              id="register-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Kayıt olunuyor...
                </>
              ) : (
                'Kayıt Ol'
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-400">
          Zaten hesabın var mı?{' '}
          <Link to="/login" className="font-medium text-dragon-400 hover:text-dragon-300 transition-colors">
            Giriş yap
          </Link>
        </p>
      </div>
    </div>
  );
}
