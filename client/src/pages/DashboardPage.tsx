import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { sessionsApi } from '../lib/api';
import type { SessionWithRole } from '../lib/api';

// ── Create Session Modal ───────────────────────────────────────────────────────
function CreateSessionModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => sessionsApi.create({ name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Yeni Oturum Oluştur</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Oturum Adı *</label>
            <input
              id="session-name-input"
              className="input"
              placeholder="Örn: Kayıp Madenlerin Haritası"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Açıklama</label>
            <textarea
              id="session-description-input"
              className="input resize-none"
              rows={3}
              placeholder="Kampanyanızı kısaca açıklayın..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">İptal</button>
          <button
            id="create-session-submit"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="btn-primary flex-1"
          >
            {mutation.isPending ? 'Oluşturuluyor…' : 'Oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Join Session Modal ─────────────────────────────────────────────────────────
function JoinSessionModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => sessionsApi.join(code.trim().toUpperCase()),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onClose();
      navigate(`/sessions/${session.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Oturuma Katıl</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">Davet Kodu</label>
          <input
            id="join-code-input"
            className="input text-center text-lg font-mono tracking-widest uppercase"
            placeholder="XXXXXXXX"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">İptal</button>
          <button
            id="join-session-submit"
            onClick={() => mutation.mutate()}
            disabled={code.trim().length !== 8 || mutation.isPending}
            className="btn-primary flex-1"
          >
            {mutation.isPending ? 'Katılınıyor…' : 'Katıl'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session Card ───────────────────────────────────────────────────────────────
function SessionCard({ session }: { session: SessionWithRole }) {
  const navigate = useNavigate();
  const date = new Date(session.createdAt).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <button
      id={`session-card-${session.id}`}
      onClick={() => navigate(`/sessions/${session.id}`)}
      className="card w-full text-left transition-all hover:border-dragon-500/40 hover:bg-dungeon-700/60 active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={session.role === 'DM' ? 'badge-dm' : 'badge-player'}>
              {session.role === 'DM' ? '⚔️ DM' : '🛡️ Oyuncu'}
            </span>
          </div>
          <h3 className="font-semibold text-white truncate">{session.name}</h3>
          {session.description && (
            <p className="mt-1 text-sm text-gray-400 line-clamp-2">{session.description}</p>
          )}
          <p className="mt-2 text-xs text-gray-500">{date}</p>
        </div>
        <span className="text-gray-500 text-lg mt-1">→</span>
      </div>
    </button>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const { data: sessions, isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: sessionsApi.list,
  });

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚔️</span>
            <div>
              <h1 className="text-xl font-bold text-white">DnD Session Manager</h1>
              <p className="text-sm text-gray-400">Hoş geldin, {user?.displayName}!</p>
            </div>
          </div>
          <button id="logout-btn" onClick={logout} className="btn-secondary text-sm">
            Çıkış Yap
          </button>
        </div>

        {/* Action buttons */}
        <div className="mb-6 flex gap-3">
          <button
            id="open-create-session"
            onClick={() => setShowCreate(true)}
            className="btn-primary flex-1"
          >
            + Oturum Oluştur
          </button>
          <button
            id="open-join-session"
            onClick={() => setShowJoin(true)}
            className="btn-secondary flex-1"
          >
            🔗 Katıl
          </button>
        </div>

        {/* Sessions list */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="card animate-pulse h-24 bg-dungeon-800/40" />
            ))}
          </div>
        )}

        {isError && (
          <div className="card text-center text-red-400 py-8">
            Oturumlar yüklenemedi. Lütfen tekrar deneyin.
          </div>
        )}

        {!isLoading && !isError && sessions?.length === 0 && (
          <div className="card flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-6xl">🐉</span>
            <h2 className="text-xl font-semibold text-white">Henüz oturum yok</h2>
            <p className="text-gray-400 max-w-xs">
              Yeni bir kampanya başlatmak için oturum oluştur ya da bir davet koduyla katıl.
            </p>
          </div>
        )}

        {sessions && sessions.length > 0 && (
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinSessionModal onClose={() => setShowJoin(false)} />}
    </div>
  );
}
