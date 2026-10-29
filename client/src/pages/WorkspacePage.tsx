import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Character, Item, SessionCreatureInput, SessionCreatureKind } from '@dnd/shared';
import { useAuth } from '../contexts/AuthContext';
import { charactersApi, creaturesApi, itemsApi, sessionsApi } from '../lib/api';
import { createPortal } from 'react-dom';

type PanelType = 'characters' | 'character' | 'npcs' | 'monsters' | 'items' | 'notes';
type ViewMode = 'grid' | 'tabs';
interface PanelInstance { id: string; type: PanelType }
interface WorkspaceConfig { panels: PanelInstance[]; mode: ViewMode; activeIndex: number }
const PANEL_LABELS: Record<PanelType, string> = {
  characters: 'Karakterler', character: 'Karakterim', npcs: 'NPC’ler', monsters: 'Canavarlar', items: 'Eşyalar', notes: 'Notlar',
};
const ALL_PANELS = Object.keys(PANEL_LABELS) as PanelType[];

function createPanelId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makePanels(types: PanelType[]): PanelInstance[] {
  return types.map((type, index) => ({ id: `default-${index}-${type}`, type }));
}

function defaultConfig(isDM: boolean): WorkspaceConfig {
  return isDM
    ? { panels: makePanels(['characters', 'npcs', 'monsters']), mode: 'grid', activeIndex: 0 }
    : { panels: makePanels(['character', 'items', 'notes']), mode: 'grid', activeIndex: 0 };
}

function readConfig(key: string, fallback: WorkspaceConfig): WorkspaceConfig {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<WorkspaceConfig> | null;
    if (!value || !Array.isArray(value.panels)) return fallback;
    const panels = value.panels.flatMap((entry): PanelInstance[] => {
      // Migrate the earlier string-only format while preserving duplicate panel instances.
      if (typeof entry === 'string' && ALL_PANELS.includes(entry as PanelType)) {
        return [{ id: createPanelId(), type: entry as PanelType }];
      }
      if (entry && typeof entry === 'object' && 'type' in entry) {
        const candidate = entry as { id?: unknown; type?: unknown };
        if (typeof candidate.type === 'string' && ALL_PANELS.includes(candidate.type as PanelType)) {
          return [{ id: typeof candidate.id === 'string' ? candidate.id : createPanelId(), type: candidate.type as PanelType }];
        }
      }
      return [];
    });
    return {
      panels,
      mode: value.mode === 'tabs' ? 'tabs' : 'grid',
      activeIndex: Math.max(0, Math.min(value.activeIndex ?? 0, Math.max(panels.length - 1, 0))),
    };
  } catch {
    return fallback;
  }
}

function nullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function CreatureEditor({
  initial,
  isPending,
  error,
  onSave,
  onClose,
}: {
  initial: SessionCreatureInput;
  isPending: boolean;
  error?: string;
  onSave: (data: SessionCreatureInput) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const update = <K extends keyof SessionCreatureInput>(key: K, value: SessionCreatureInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <form className="card w-full max-w-lg space-y-4" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{form.kind === 'NPC' ? 'NPC kaydı' : 'Canavar kaydı'}</h2>
          <button type="button" onClick={onClose} className="text-xl text-gray-400 hover:text-white">×</button>
        </div>
        <label className="block text-xs text-gray-400">Ad
          <input autoFocus required maxLength={100} className="input mt-1" value={form.name} onChange={(event) => update('name', event.target.value)} />
        </label>
        <label className="block text-xs text-gray-400">Açıklama ve notlar
          <textarea maxLength={4000} rows={4} className="input mt-1 resize-y" value={form.summary} onChange={(event) => update('summary', event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['hp', 'Mevcut can'], ['maxHp', 'Maksimum can'], ['armorClass', 'Zırh sınıfı'], ['initiative', 'İnisiyatif'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-xs text-gray-400">{label}
              <input type="number" min={key === 'initiative' ? -99 : 0} className="input mt-1" value={form[key] ?? ''}
                onChange={(event) => update(key, nullableNumber(event.target.value))} />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.isVisibleToPlayers} onChange={(event) => update('isVisibleToPlayers', event.target.checked)} />
          Oyuncular görebilsin
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isPending} className="btn-secondary">Vazgeç</button>
          <button type="submit" disabled={isPending || !form.name.trim()} className="btn-primary">{isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

export default function WorkspacePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: session, isLoading: sessionLoading, isError } = useQuery({
    queryKey: ['session', sessionId], queryFn: () => sessionsApi.get(sessionId!), enabled: !!sessionId,
  });
  const isDM = session?.role === 'DM';
  const storageKey = `workspace:${user?.id ?? 'anonymous'}:${sessionId ?? ''}`;
  const [config, setConfig] = useState<WorkspaceConfig>({ panels: [], mode: 'grid', activeIndex: 0 });
  const [configReady, setConfigReady] = useState(false);
  const [notes, setNotes] = useState('');
  const [creatureModal, setCreatureModal] = useState<{ id: string | null; data: SessionCreatureInput } | null>(null);

  useEffect(() => {
    if (!session || !user) return;
    const defaults = defaultConfig(session.role === 'DM');
    const prefix = `workspace:${user.id}:${sessionId ?? ''}`;
    setConfig(readConfig(prefix, defaults));
    setNotes(localStorage.getItem(`${prefix}:notes`) ?? '');
    setConfigReady(true);
  }, [session, sessionId, user]);

  useEffect(() => {
    if (configReady) localStorage.setItem(storageKey, JSON.stringify(config));
  }, [config, configReady, storageKey]);

  const { data: characters = [] } = useQuery({
    queryKey: ['characters', sessionId], queryFn: () => charactersApi.list(sessionId!), enabled: !!sessionId,
  });
  const { data: items = [] } = useQuery({
    queryKey: ['items', sessionId], queryFn: () => itemsApi.list(sessionId!), enabled: !!sessionId,
  });
  const { data: creatures = [], isError: creaturesError } = useQuery({
    queryKey: ['creatures', sessionId], queryFn: () => creaturesApi.list(sessionId!), enabled: !!sessionId,
  });

  const saveCreature = useMutation({
    mutationFn: (input: { id: string | null; data: SessionCreatureInput }) => input.id
      ? creaturesApi.update(sessionId!, input.id, input.data)
      : creaturesApi.create(sessionId!, input.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatures', sessionId] });
      setCreatureModal(null);
    },
  });
  const deleteCreature = useMutation({
    mutationFn: (id: string) => creaturesApi.delete(sessionId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['creatures', sessionId] }),
  });

  const visibleCharacters = useMemo(() => isDM ? characters : characters.filter((character) => character.ownerId === user?.id), [characters, isDM, user?.id]);
  const availablePanels = ALL_PANELS;

  function addPanel(panel: PanelType) {
    setConfig((current) => ({ ...current, panels: [...current.panels, { id: createPanelId(), type: panel }], activeIndex: current.panels.length }));
  }
  function removePanel(index: number) {
    setConfig((current) => {
      const panels = current.panels.filter((_, i) => i !== index);
      const activeIndex = current.activeIndex > index ? current.activeIndex - 1 : current.activeIndex === index ? Math.min(index, Math.max(panels.length - 1, 0)) : current.activeIndex;
      return { ...current, panels, activeIndex };
    });
  }
  function movePanel(index: number, direction: -1 | 1) {
    setConfig((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.panels.length) return current;
      const panels = [...current.panels];
      [panels[index], panels[target]] = [panels[target], panels[index]];
      return { ...current, panels, activeIndex: current.activeIndex === index ? target : current.activeIndex === target ? index : current.activeIndex };
    });
  }

  if (sessionLoading || !configReady) return <div className="flex min-h-screen items-center justify-center text-gray-400">Çalışma alanı yükleniyor…</div>;
  if (isError || !session) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-gray-400"><p>Oturum bulunamadı veya erişim yetkin yok.</p><button onClick={() => navigate('/dashboard')} className="btn-secondary">Dashboard’a dön</button></div>;

  function renderCreaturePanel(kind: SessionCreatureKind) {
    const entries = creatures.filter((creature) => creature.kind === kind);
    return <div className="space-y-3">
      {isDM && <button className="btn-secondary w-full text-sm" onClick={() => setCreatureModal({ id: null, data: {
        kind, name: '', summary: '', hp: null, maxHp: null, armorClass: null, initiative: null, isVisibleToPlayers: false,
      } })}>+ {kind === 'NPC' ? 'NPC ekle' : 'Canavar ekle'}</button>}
      {creaturesError && <p role="alert" className="text-sm text-red-400">Kayıtlar yüklenemedi.</p>}
      {entries.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">Henüz {kind === 'NPC' ? 'NPC' : 'canavar'} eklenmemiş.</p> : entries.map((entry) => (
        <article key={entry.id} className="rounded-lg border border-white/10 bg-dungeon-900 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><h3 className="font-semibold text-white">{entry.name}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-gray-400">{entry.summary || 'Açıklama yok'}</p></div>
            {isDM && <div className="flex shrink-0 gap-2 text-xs"><button className="text-dragon-400" onClick={() => setCreatureModal({ id: entry.id, data: {
              kind: entry.kind, name: entry.name, summary: entry.summary, hp: entry.hp, maxHp: entry.maxHp, armorClass: entry.armorClass, initiative: entry.initiative, isVisibleToPlayers: entry.isVisibleToPlayers,
            } })}>Düzenle</button><button className="text-gray-500 hover:text-red-400" onClick={() => { if (confirm(`${entry.name} silinsin mi?`)) deleteCreature.mutate(entry.id); }}>Sil</button></div>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-300">
            {entry.hp !== null && <span className="badge bg-red-500/10 text-red-300">Can {entry.hp}{entry.maxHp !== null ? `/${entry.maxHp}` : ''}</span>}
            {entry.armorClass !== null && <span className="badge bg-white/10">ZS {entry.armorClass}</span>}
            {entry.initiative !== null && <span className="badge bg-white/10">İnisiyatif {entry.initiative}</span>}
            {isDM && <span className="badge bg-white/10">{entry.isVisibleToPlayers ? 'Oyunculara açık' : 'DM’e özel'}</span>}
          </div>
        </article>
      ))}
    </div>;
  }

  function renderPanel(panel: PanelType) {
    if (panel === 'characters' || panel === 'character') {
      const list = panel === 'character' ? visibleCharacters : characters;
      return <div className="space-y-2">{list.length ? list.map((character: Character) => <Link key={character.id} to={`/sessions/${sessionId}/characters/${character.id}`} className="flex items-center justify-between rounded-lg bg-dungeon-900 p-3 hover:bg-dungeon-700">
        <span className="min-w-0"><strong className="block truncate text-white">{character.name}</strong><small className="text-gray-500">{character.class} · Seviye {character.level}</small></span>
        <span className="ml-3 text-xs text-dragon-400">Aç →</span>
      </Link>) : <p className="py-8 text-center text-sm text-gray-500">Görüntülenecek karakter yok.</p>}</div>;
    }
    if (panel === 'npcs') return renderCreaturePanel('NPC');
    if (panel === 'monsters') return renderCreaturePanel('MONSTER');
    if (panel === 'items') return <div className="space-y-2">{items.length ? items.map((item: Item) => <div key={item.id} className="rounded-lg bg-dungeon-900 p-3"><strong className="text-white">{item.name}</strong><p className="mt-1 line-clamp-3 text-sm text-gray-400">{item.description}</p></div>) : <p className="py-8 text-center text-sm text-gray-500">Henüz eşya yok.</p>}<Link className="mt-3 inline-block text-xs text-dragon-400 hover:text-dragon-300" to={`/sessions/${sessionId}/items`}>Eşya sayfasını aç →</Link></div>;
    return <textarea className="input min-h-56 w-full resize-y" placeholder="Bu oturum için kişisel notların…" value={notes} onChange={(event) => {
      setNotes(event.target.value);
      localStorage.setItem(`${storageKey}:notes`, event.target.value);
    }} />;
  }

  return <div className="min-h-screen p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link to={`/sessions/${sessionId}`} className="text-sm text-gray-500 hover:text-gray-300">← Oturum ana sayfası</Link><div className="mt-2 flex items-center gap-2"><span className={isDM ? 'badge-dm' : 'badge-player'}>{isDM ? 'DM çalışma alanı' : 'Oyuncu çalışma alanı'}</span><span className="text-xs text-gray-500">Düzenin bu oturum ve hesabın için kaydedilir.</span></div><h1 className="mt-2 text-2xl font-bold text-white">{session.name}</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/sessions/${sessionId}/combat`} className="btn-secondary text-sm">⚔️ Tur sırası</Link>
          <Link to={`/sessions/${sessionId}/logbook`} className="btn-secondary text-sm">📖 Oturum günlüğü</Link>
          <label className="sr-only" htmlFor="workspace-add-panel">Panel ekle</label>
          <select id="workspace-add-panel" className="input w-auto" value="" onChange={(event) => { if (event.target.value) addPanel(event.target.value as PanelType); }}>
            <option value="">+ Panel ekle</option>{availablePanels.map((panel) => <option key={panel} value={panel}>{PANEL_LABELS[panel]}</option>)}
          </select>
          <div className="flex rounded-lg border border-white/10 p-1">
            <button onClick={() => setConfig((current) => ({ ...current, mode: 'grid' }))} className={`rounded-md px-3 py-1.5 text-sm ${config.mode === 'grid' ? 'bg-dragon-500/20 text-dragon-300' : 'text-gray-400'}`}>Izgara</button>
            <button onClick={() => setConfig((current) => ({ ...current, mode: 'tabs' }))} className={`rounded-md px-3 py-1.5 text-sm ${config.mode === 'tabs' ? 'bg-dragon-500/20 text-dragon-300' : 'text-gray-400'}`}>Sekmeler</button>
          </div>
        </div>
      </header>

      {config.panels.length === 0 ? <div className="card py-16 text-center"><h2 className="text-lg font-semibold text-white">Çalışma alanını oluştur</h2><p className="mt-2 text-sm text-gray-400">Üstteki menüden görmek istediğin panelleri ekle.</p></div> : <>
        {config.mode === 'tabs' && <nav className="flex gap-2 overflow-x-auto border-b border-white/10 pb-2">{config.panels.map((panel, index) => <button key={panel.id} onClick={() => setConfig((current) => ({ ...current, activeIndex: index }))} className={`shrink-0 rounded-lg px-4 py-2 text-sm ${config.activeIndex === index ? 'bg-dragon-500/20 text-dragon-300' : 'text-gray-400 hover:bg-white/5'}`}>{PANEL_LABELS[panel.type]}{config.panels.filter((item) => item.type === panel.type).length > 1 ? ` ${config.panels.slice(0, index + 1).filter((item) => item.type === panel.type).length}` : ''}</button>)}</nav>}
        <div className={config.mode === 'grid' ? 'grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]' : 'grid'}>
          {config.panels.map((panel, index) => config.mode === 'grid' || index === config.activeIndex ? <section key={panel.id} className="card min-h-80 overflow-hidden">
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/10 pb-3">
              <h2 className="font-semibold text-white">{PANEL_LABELS[panel.type]}{config.panels.filter((item) => item.type === panel.type).length > 1 ? ` ${config.panels.slice(0, index + 1).filter((item) => item.type === panel.type).length}` : ''}</h2>
              <div className="flex items-center gap-1"><button title="Sola taşı" disabled={index === 0} onClick={() => movePanel(index, -1)} className="rounded px-2 py-1 text-gray-500 hover:text-white disabled:opacity-30">←</button><button title="Sağa taşı" disabled={index === config.panels.length - 1} onClick={() => movePanel(index, 1)} className="rounded px-2 py-1 text-gray-500 hover:text-white disabled:opacity-30">→</button><button title="Paneli kaldır" onClick={() => removePanel(index)} className="rounded px-2 py-1 text-gray-500 hover:text-red-400">×</button></div>
            </div>
            {renderPanel(panel.type)}
          </section> : null)}
        </div>
      </>}
    </div>
    {creatureModal && <CreatureEditor initial={creatureModal.data} isPending={saveCreature.isPending} error={saveCreature.error?.message} onClose={() => setCreatureModal(null)} onSave={(data) => saveCreature.mutate({ id: creatureModal.id, data })} />}
  </div>;
}
