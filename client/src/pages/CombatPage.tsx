import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Combatant, CombatantKind, SessionCombatInput } from '@dnd/shared';
import { useAuth } from '../contexts/AuthContext';
import { charactersApi, combatApi, creaturesApi, sessionsApi } from '../lib/api';
import { useSessionSocket } from '../hooks/useSessionSocket';

const KIND_LABELS: Record<CombatantKind, string> = {
  CHARACTER: 'Karakter', NPC: 'NPC', MONSTER: 'Canavar', CUSTOM: 'Özel',
};

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initialInitiative(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return 0;
  const match = String(value).match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}

function sortedEntries(entries: Combatant[]) {
  return entries.map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.initiative - a.entry.initiative || a.index - b.index)
    .map(({ entry }) => entry);
}

export default function CombatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  useSessionSocket(sessionId);
  const [kind, setKind] = useState<CombatantKind>('CHARACTER');
  const [sourceId, setSourceId] = useState('');
  const [initiative, setInitiative] = useState('0');
  const [customName, setCustomName] = useState('');
  const [customInitiative, setCustomInitiative] = useState('0');

  const { data: session, isLoading: sessionLoading, isError: sessionError } = useQuery({
    queryKey: ['session', sessionId], queryFn: () => sessionsApi.get(sessionId!), enabled: !!sessionId,
  });
  const isDM = session?.role === 'DM';
  const { data: combat, isLoading: combatLoading, isError: combatError } = useQuery({
    queryKey: ['combat', sessionId], queryFn: () => combatApi.get(sessionId!), enabled: !!sessionId,
  });
  const { data: characters = [] } = useQuery({
    queryKey: ['characters', sessionId], queryFn: () => charactersApi.list(sessionId!), enabled: !!sessionId,
  });
  const { data: creatures = [] } = useQuery({
    queryKey: ['creatures', sessionId], queryFn: () => creaturesApi.list(sessionId!), enabled: !!sessionId && isDM,
  });

  const saveMutation = useMutation({
    mutationFn: (data: SessionCombatInput) => combatApi.save(sessionId!, data),
    onSuccess: (data) => queryClient.setQueryData(['combat', sessionId], data),
  });
  const empty: SessionCombatInput = { round: 1, activeEntryId: null, isActive: false, entries: [] };
  const state = combat ?? empty;
  const ordered = useMemo(() => sortedEntries(state.entries), [state.entries]);
  const active = ordered.find((entry) => entry.id === state.activeEntryId);
  const options = useMemo(() => {
    if (kind === 'CHARACTER') return characters.map((character) => ({ id: character.id, name: character.name, initiative: initialInitiative(character.stats.find((stat) => ['initiative', 'inisiyatif', 'inis', 'init'].includes(stat.name.trim().toLocaleLowerCase('tr-TR')))?.value) }));
    if (kind === 'NPC' || kind === 'MONSTER') return creatures.filter((creature) => creature.kind === kind).map((creature) => ({ id: creature.id, name: creature.name, initiative: creature.initiative ?? 0 }));
    return [];
  }, [kind, characters, creatures]);

  function commit(next: SessionCombatInput) {
    queryClient.setQueryData(['combat', sessionId], { ...next, sessionId, updatedAt: new Date().toISOString() });
    saveMutation.mutate(next);
  }

  function addExisting() {
    const source = options.find((option) => option.id === sourceId);
    if (!source) return;
    if (state.entries.some((entry) => entry.sourceId === source.id)) return;
    const entry: Combatant = { id: newId(), sourceId: source.id, kind, name: source.name, initiative: Number(initiative) || 0 };
    commit({ ...state, entries: [...state.entries, entry] });
    setSourceId('');
  }

  function addCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = customName.trim();
    if (!name || state.entries.length >= 100) return;
    const entry: Combatant = { id: newId(), sourceId: null, kind: 'CUSTOM', name, initiative: Number(customInitiative) || 0 };
    commit({ ...state, entries: [...state.entries, entry] });
    setCustomName('');
    setCustomInitiative('0');
  }

  function startCombat() {
    const first = sortedEntries(state.entries)[0];
    if (!first) return;
    commit({ ...state, round: 1, activeEntryId: first.id, isActive: true });
  }

  function nextTurn() {
    if (!ordered.length || !active) return;
    const index = ordered.findIndex((entry) => entry.id === active.id);
    const nextIndex = (index + 1) % ordered.length;
    commit({ ...state, round: nextIndex === 0 ? state.round + 1 : state.round, activeEntryId: ordered[nextIndex].id });
  }

  function removeEntry(id: string) {
    const remaining = ordered.filter((entry) => entry.id !== id);
    const wasActive = id === state.activeEntryId;
    const oldIndex = ordered.findIndex((entry) => entry.id === id);
    const nextActive = wasActive ? remaining[Math.min(oldIndex, remaining.length - 1)] : active;
    commit({ ...state, entries: remaining, activeEntryId: nextActive?.id ?? null, isActive: state.isActive && remaining.length > 0 });
  }

  function changeInitiative(id: string, value: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return;
    commit({ ...state, entries: state.entries.map((entry) => entry.id === id ? { ...entry, initiative: parsed } : entry) });
  }

  if (sessionLoading || combatLoading) return <div className="flex min-h-screen items-center justify-center text-gray-400">Tur sırası yükleniyor…</div>;
  if (sessionError || !session || !sessionId) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-gray-400"><p>Oturum bulunamadı veya erişim yetkin yok.</p><button onClick={() => navigate('/dashboard')} className="btn-secondary">Dashboard’a dön</button></div>;

  return <main className="min-h-screen p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={`/sessions/${sessionId}/workspace`} className="text-sm text-gray-500 hover:text-gray-300">← Çalışma alanı</Link>
          <div className="mt-3 flex items-center gap-2"><span className={isDM ? 'badge-dm' : 'badge-player'}>{isDM ? 'DM' : 'Oyuncu'}</span><span className="text-sm text-gray-500">{session.name}</span></div>
          <h1 className="mt-2 text-3xl font-bold text-white">⚔️ Tur sırası</h1>
          <p className="mt-1 text-sm text-gray-400">Herkes aynı sırayı görür. Sıra değişiklikleri anında paylaşılır.</p>
        </div>
        <Link to={`/sessions/${sessionId}`} className="btn-secondary text-sm">Oturum ana sayfası</Link>
      </header>

      {combatError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Tur sırası yüklenemedi. Sayfayı yenileyip tekrar dene.</p>}
      {saveMutation.isError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Değişiklik kaydedilemedi: {saveMutation.error.message}</p>}

      <section className="card overflow-hidden border-dragon-500/20 bg-gradient-to-br from-dungeon-800 to-dungeon-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-white/10 bg-black/20"><span className="text-[10px] uppercase tracking-wider text-gray-500">Tur</span><strong className="text-2xl text-white">{state.round}</strong></div>
            <div><p className="text-xs uppercase tracking-wider text-gray-500">{state.isActive ? 'Şu an sıra' : 'Savaş durumu'}</p><h2 className="mt-1 text-xl font-bold text-white">{state.isActive ? active?.name ?? 'Sıra belirlenmedi' : 'Savaş başlamadı'}</h2>
              {state.isActive && active?.kind === 'CHARACTER' && active.sourceId && characters.some((character) => character.id === active.sourceId && character.ownerId === user?.id) && <p className="mt-1 text-sm font-semibold text-emerald-300">SIRA SENDE</p>}
              {!state.isActive && <p className="mt-1 text-sm text-gray-400">{ordered.length ? `${ordered.length} dövüşçü hazır` : 'DM dövüşçü eklediğinde sıra burada görünecek.'}</p>}
            </div>
          </div>
          {isDM && <div className="flex flex-wrap gap-2">
            {!state.isActive ? <button disabled={!ordered.length || saveMutation.isPending} onClick={startCombat} className="btn-primary">⚔️ Savaşı başlat</button> : <button disabled={ordered.length < 1 || saveMutation.isPending} onClick={nextTurn} className="btn-primary">Sıradaki tur →</button>}
            {state.isActive && <button disabled={saveMutation.isPending} onClick={() => commit({ ...state, isActive: false, activeEntryId: null, round: 1 })} className="btn-secondary">Savaşı bitir</button>}
          </div>}
        </div>
        {!isDM && <p className="mt-4 rounded-lg bg-black/20 px-3 py-2 text-xs text-gray-500">Tur sırası DM tarafından yönetilir.</p>}
      </section>

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold text-white">İnisiyatif sırası</h2><p className="mt-1 text-xs text-gray-500">Yüksek inisiyatif önce oynar.</p></div><span className="badge bg-white/5 text-gray-400">{ordered.length} dövüşçü</span></div>
        {ordered.length === 0 ? <div className="px-5 py-12 text-center"><span className="text-4xl">🛡️</span><p className="mt-3 font-medium text-white">Henüz dövüşçü yok</p><p className="mt-1 text-sm text-gray-500">{isDM ? 'Aşağıdan karakter, NPC veya canavar ekle.' : 'DM savaş sırasını hazırlıyor.'}</p></div> : <ol className="divide-y divide-white/5">
          {ordered.map((entry, index) => {
            const isCurrent = state.isActive && entry.id === state.activeEntryId;
            const isMine = entry.kind === 'CHARACTER' && entry.sourceId && characters.some((character) => character.id === entry.sourceId && character.ownerId === user?.id);
            return <li key={entry.id} aria-current={isCurrent ? 'step' : undefined} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${isCurrent ? 'bg-dragon-500/10' : ''}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isCurrent ? 'bg-dragon-500 text-white' : 'bg-white/5 text-gray-500'}`}>{isCurrent ? '▶' : index + 1}</span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className={isCurrent ? 'truncate text-white' : 'truncate text-gray-200'}>{entry.name}</strong><span className="badge bg-white/5 text-gray-500">{KIND_LABELS[entry.kind]}</span>{isMine && <span className="text-xs text-emerald-300">Senin karakterin</span>}{isCurrent && <span className="text-xs font-bold uppercase tracking-wider text-dragon-300">Sıra onda</span>}</div></div>
              <div className="flex shrink-0 items-center gap-2"><span className="text-xs text-gray-500">İNİS.</span>{isDM ? <input aria-label={`${entry.name} inisiyatif`} type="number" min={-99} max={999} value={entry.initiative} disabled={saveMutation.isPending} onChange={(event) => changeInitiative(entry.id, event.target.value)} className="input w-20 px-2 py-1 text-center" /> : <span className="min-w-8 text-center font-semibold text-white">{entry.initiative}</span>}{isDM && <button aria-label={`${entry.name} dövüşçüsünü kaldır`} title="Listeden kaldır" disabled={saveMutation.isPending} onClick={() => removeEntry(entry.id)} className="rounded px-2 py-1 text-gray-500 hover:text-red-300">×</button>}</div>
            </li>;
          })}
        </ol>}
      </section>

      {isDM && <section className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4">
          <div><h2 className="font-semibold text-white">Dövüşçü ekle</h2><p className="mt-1 text-xs text-gray-500">Oturumdaki karakter, NPC veya canavarlardan seç.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-400">Tür<select className="input mt-1" value={kind} onChange={(event) => { const next = event.target.value as CombatantKind; setKind(next); setSourceId(''); setInitiative('0'); }}><option value="CHARACTER">Karakter</option><option value="NPC">NPC</option><option value="MONSTER">Canavar</option></select></label>
            <label className="text-xs text-gray-400">Dövüşçü<select className="input mt-1" value={sourceId} onChange={(event) => { setSourceId(event.target.value); const option = options.find((item) => item.id === event.target.value); if (option) setInitiative(String(option.initiative)); }}><option value="">Seç…</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}{state.entries.some((entry) => entry.sourceId === option.id) ? ' · eklendi' : ''}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap items-end gap-3"><label className="text-xs text-gray-400">İnisiyatif<input className="input mt-1 w-28" type="number" min={-99} max={999} value={initiative} onChange={(event) => setInitiative(event.target.value)} /></label><button className="btn-secondary" disabled={!sourceId || state.entries.length >= 100 || saveMutation.isPending || state.entries.some((entry) => entry.sourceId === sourceId)} onClick={addExisting}>+ Sıraya ekle</button></div>
          {options.length === 0 && <p className="text-xs text-gray-500">Bu türde eklenecek kayıt yok.</p>}
        </div>
        <form className="card space-y-4" onSubmit={addCustom}>
          <div><h2 className="font-semibold text-white">Özel dövüşçü</h2><p className="mt-1 text-xs text-gray-500">Oturum kayıtlarında olmayan rakipleri veya çağrıları ekle.</p></div>
          <div className="flex flex-wrap items-end gap-3"><label className="min-w-40 flex-1 text-xs text-gray-400">Ad<input className="input mt-1" maxLength={100} value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Örn. İskelet muhafız" /></label><label className="text-xs text-gray-400">İnisiyatif<input className="input mt-1 w-28" type="number" min={-99} max={999} value={customInitiative} onChange={(event) => setCustomInitiative(event.target.value)} /></label><button className="btn-secondary" type="submit" disabled={!customName.trim() || state.entries.length >= 100 || saveMutation.isPending}>+ Ekle</button></div>
        </form>
      </section>}
      {isDM && <p className="text-right text-xs text-gray-600">{saveMutation.isPending ? 'Kaydediliyor…' : saveMutation.isSuccess ? 'Kaydedildi' : ''}</p>}
    </div>
  </main>;
}
