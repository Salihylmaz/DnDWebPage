import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { verifyEmail } = useAuth();
  const [error, setError] = useState('');
  const started = useRef(false);
  const token = searchParams.get('token') ?? new URLSearchParams(window.location.hash.slice(1)).get('token');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError('Doğrulama bağlantısı eksik.');
      return;
    }
    verifyEmail(token).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'E-posta doğrulanamadı.');
    });
  }, [token, verifyEmail]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card relative w-full max-w-md text-center">
        <span className="text-4xl" aria-hidden="true">✉️</span>
        <h1 className="mt-4 text-xl text-white">E-posta doğrulama</h1>
        {error ? (
          <>
            <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>
            <Link to="/login" className="btn-primary mt-6">Giriş sayfasına dön</Link>
          </>
        ) : (
          <p className="mt-3 text-sm text-gray-400" role="status">Adresin doğrulanıyor…</p>
        )}
      </div>
    </div>
  );
}
