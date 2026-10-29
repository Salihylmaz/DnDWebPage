import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { sessionsApi } from '../lib/api';
import type { SessionMember } from '@dnd/shared';

// ── Member Row ─────────────────────────────────────────────────────────────────
function MemberRow({
  member,
  canRemove,
  sessionId,
}: {
  member: SessionMember;
  canRemove: boolean;
  sessionId: string;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const removeMutation = useMutation({
    mutationFn: () => sessionsApi.removeMember(sessionId, member.userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-members', sessionId] });
    },
  });

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={member.role === 'DM' ? 'badge-dm' : 'badge-player'}>
          {member.role === 'DM' ? '⚔️ DM' : '🛡️'}
        </span>
        <span className="text-sm text-white truncate">{member.user.displayName}</span>
        <span className="text-xs text-gray-500 truncate hidden sm:block">({member.user.email})</span>
      </div>
      {canRemove && member.role !== 'DM' && (
        confirming ? (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="text-xs text-red-400 hover:text-red-300 font-medium"
            >
              {removeMutation.isPending ? '…' : 'Onayla'}
            </button>
            <button onClick={() => setConfirming(false)} className="text-xs text-gray-500 hover:text-gray-300">
              İptal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors shrink-0"
          >
            Çıkar
          </button>
        )
      )}
    </div>
  );
}

// ── Session Page ──────────────────────────────────────────────────────────────
export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const {
    data: session,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
  });

  const { data: members } = useQuery({
    queryKey: ['session-members', sessionId],
    queryFn: () => sessionsApi.getMembers(sessionId!),
    enabled: !!sessionId,
  });

  const settingsMutation = useMutation({
    mutationFn: (val: boolean) => sessionsApi.updateSettings(sessionId!, val),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session', sessionId] }),
  });

  const isDM = session?.role === 'DM';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">Yükleniyor…</div>
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-5xl">🗺️</span>
        <p className="text-gray-400">Oturum bulunamadı veya erişim yetkiniz yok.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-secondary">
          Dashboard'a dön
        </button>
      </div>
    );
  }

  const inviteLink = `${window.location.origin}/join/${session.inviteCode}`;

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back + Header */}
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="mb-4 text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            ← Dashboard
          </button>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={isDM ? 'badge-dm' : 'badge-player'}>
                  {isDM ? '⚔️ DM' : '🛡️ Oyuncu'}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white">{session.name}</h1>
              {session.description && (
                <p className="mt-1 text-gray-400">{session.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick nav */}
        <Link
          to={`/sessions/${sessionId}/workspace`}
          className="card flex items-center justify-between gap-4 border-dragon-500/30 bg-dragon-500/5 hover:bg-dragon-500/10 transition-colors"
        >
          <div>
            <p className="font-semibold text-white">{isDM ? 'DM çalışma alanı' : 'Çalışma alanım'}</p>
            <p className="mt-1 text-sm text-gray-400">Panelleri seç, kendi oturum düzenini oluştur.</p>
          </div>
          <span className="shrink-0 text-sm text-dragon-400">Aç →</span>
        </Link>

        <Link
          to={`/sessions/${sessionId}/combat`}
          className="card flex items-center justify-between gap-4 border-amber-500/20 hover:border-amber-400/40 transition-colors"
        >
          <div>
            <p className="font-semibold text-white">⚔️ Tur sırası</p>
            <p className="mt-1 text-sm text-gray-400">Combat’ta kimin sırası olduğunu gör.</p>
          </div>
          <span className="shrink-0 text-sm text-amber-300">Aç →</span>
        </Link>

        <Link
          to={`/sessions/${sessionId}/logbook`}
          className="card flex items-center justify-between gap-4 border-emerald-500/20 hover:border-emerald-400/40 transition-colors"
        >
          <div>
            <p className="font-semibold text-white">📖 Oturum günlüğü</p>
            <p className="mt-1 text-sm text-gray-400">Önceki oturumları ve en son nerede kaldığınızı hatırla.</p>
          </div>
          <span className="shrink-0 text-sm text-emerald-300">Aç →</span>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link
            to={`/sessions/${sessionId}/items`}
            id="nav-items"
            className="card flex flex-col items-center gap-2 py-6 text-center hover:border-dragon-500/40 hover:bg-dungeon-700/60 transition-all"
          >
            <span className="text-3xl">🎒</span>
            <span className="text-sm font-medium text-white">Eşyalar</span>
          </Link>
          <Link
            to={`/sessions/${sessionId}/characters`}
            id="nav-characters"
            className="card flex flex-col items-center gap-2 py-6 text-center hover:border-dragon-500/40 hover:bg-dungeon-700/60 transition-all"
          >
            <span className="text-3xl">📜</span>
            <span className="text-sm font-medium text-white">Karakterler</span>
          </Link>
        </div>

        {/* Invite code (DM only) */}
        {isDM && (
          <div className="card">
            <h2 className="mb-3 font-semibold text-white">🔗 Davet Kodu</h2>
            <div className="flex items-center gap-3">
              <code
                id="invite-code"
                className="flex-1 rounded-lg bg-dungeon-900 px-4 py-2.5 font-mono text-xl font-bold tracking-widest text-dragon-400 text-center"
              >
                {session.inviteCode}
              </code>
              <button
                id="copy-invite-code"
                onClick={() => navigator.clipboard.writeText(session.inviteCode)}
                className="btn-secondary text-sm shrink-0"
              >
                Kopyala
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500 break-all">{inviteLink}</p>
          </div>
        )}

        {/* DM Settings */}
        {isDM && (
          <div className="card">
            <h2 className="mb-3 font-semibold text-white">⚙️ Oturum Ayarları</h2>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Oyuncular stat düzenleyebilir</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Kapalıysa yalnızca DM stat girebilir.
                </p>
              </div>
              <button
                id="toggle-players-can-edit-stats"
                onClick={() => settingsMutation.mutate(!session.playersCanEditStats)}
                disabled={settingsMutation.isPending}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  session.playersCanEditStats ? 'bg-dragon-500' : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    session.playersCanEditStats ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Member list */}
        <div className="card">
          <h2 className="mb-3 font-semibold text-white">
            👥 Üyeler {members ? `(${members.length})` : ''}
          </h2>
          {members ? (
            members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                canRemove={isDM && m.userId !== user?.id}
                sessionId={sessionId!}
              />
            ))
          ) : (
            <div className="text-sm text-gray-500 animate-pulse">Yükleniyor…</div>
          )}
        </div>
      </div>
    </div>
  );
}
