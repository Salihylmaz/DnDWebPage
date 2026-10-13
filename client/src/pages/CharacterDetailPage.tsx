import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { sessionsApi, charactersApi, traitsApi, itemsApi, skillsApi } from '../lib/api';
import type { StatEntry } from '../lib/api';
import type { CharacterTrait, Item, CharacterSkill, SkillInput, SkillActionType } from '@dnd/shared';
import { createPortal } from 'react-dom';

// ── Edit Basic Info Modal ─────────────────────────────────────────────────────
function EditBasicModal({
  sessionId,
  charId,
  initial,
  onClose,
}: {
  sessionId: string;
  charId: string;
  initial: { name: string; class: string; level: number };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial.name);
  const [charClass, setCharClass] = useState(initial.class);
  const [level, setLevel] = useState(initial.level);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => charactersApi.update(sessionId, charId, { name, class: charClass, level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character', sessionId, charId] });
      queryClient.invalidateQueries({ queryKey: ['characters', sessionId] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Karakter Bilgilerini Düzenle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors">✕</button>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Ad</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Sınıf</label>
            <input className="input" value={charClass} onChange={(e) => setCharClass(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Seviye</label>
            <input
              type="number"
              min={1}
              max={20}
              className="input"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">İptal</button>
          <button
            id="save-char-basic"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !charClass.trim() || mutation.isPending}
            className="btn-primary flex-1"
          >
            {mutation.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Stat Row ───────────────────────────────────────────────────────────────
function AddStatRow({
  onAdd,
  existingNames,
}: {
  onAdd: (stat: StatEntry) => void;
  existingNames: string[];
}) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const handle = () => {
    const n = name.trim().toUpperCase();
    if (!n || existingNames.includes(n)) return;
    onAdd({ name: n, value: value.trim() || '0' });
    setName('');
    setValue('');
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        id="new-stat-name"
        className="input py-1.5 text-sm uppercase w-28"
        placeholder="Stat adı"
        value={name}
        onChange={(e) => setName(e.target.value.toUpperCase())}
        maxLength={10}
      />
      <input
        id="new-stat-value"
        className="input py-1.5 text-sm w-20"
        placeholder="Değer"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        id="add-stat-btn"
        onClick={handle}
        disabled={!name.trim()}
        className="btn-secondary text-sm py-1.5"
      >
        + Ekle
      </button>
    </div>
  );
}

// ── TraitsSection ──────────────────────────────────────────────────────────────
function TraitsSection({
  sessionId,
  charId,
  canManage,
}: {
  sessionId: string;
  charId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [addingType, setAddingType] = useState<'TRAIT' | 'NOTE' | null>(null);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const { data: traits = [] } = useQuery({
    queryKey: ['traits', sessionId, charId],
    queryFn: () => traitsApi.list(sessionId, charId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['traits', sessionId, charId] });

  const createMutation = useMutation({
    mutationFn: (data: { type: 'TRAIT' | 'NOTE'; text: string }) =>
      traitsApi.create(sessionId, charId, data),
    onSuccess: () => { invalidate(); setAddingType(null); setNewText(''); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      traitsApi.update(sessionId, charId, id, text),
    onSuccess: () => { invalidate(); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => traitsApi.delete(sessionId, charId, id),
    onSuccess: invalidate,
  });

  const traitList = traits.filter((t: CharacterTrait) => t.type === 'TRAIT');
  const noteList = traits.filter((t: CharacterTrait) => t.type === 'NOTE');

  return (
    <div className="space-y-4">
      {/* TRAITS */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">🎭 Özellikler</h2>
          {canManage && (
            <button
              id="add-trait-btn"
              onClick={() => { setAddingType('TRAIT'); setNewText(''); }}
              className="text-xs text-dragon-400 hover:text-dragon-300 transition-colors"
            >
              + Ekle
            </button>
          )}
        </div>

        {/* Trait chips */}
        <div className="flex flex-wrap gap-2 min-h-[28px]">
          {traitList.map((t: CharacterTrait) =>
            editingId === t.id ? (
              <div key={t.id} className="flex items-center gap-1">
                <input
                  className="input py-0.5 text-xs w-32"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => updateMutation.mutate({ id: t.id, text: editText })}
                  className="text-xs text-green-400 hover:text-green-300"
                >✓</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-500">✕</button>
              </div>
            ) : (
              <div
                key={t.id}
                className="group flex items-center gap-1 rounded-full bg-dragon-500/20 px-3 py-0.5"
              >
                <span className="text-xs font-medium text-dragon-400">{t.text}</span>
                {canManage && (
                  <>
                    <button
                      onClick={() => { setEditingId(t.id); setEditText(t.text); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-all text-xs"
                    >✏️</button>
                    <button
                      onClick={() => deleteMutation.mutate(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all text-xs"
                    >×</button>
                  </>
                )}
              </div>
            )
          )}
          {traitList.length === 0 && !addingType && (
            <p className="text-xs text-gray-600 italic">Henüz özellik yok.</p>
          )}
        </div>

        {/* Add trait form */}
        {addingType === 'TRAIT' && (
          <div className="mt-3 flex items-center gap-2">
            <input
              id="new-trait-input"
              className="input py-1.5 text-sm flex-1"
              placeholder="Özellik (ör: Cesur, Açgözlü…)"
              value={newText}
              autoFocus
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newText.trim()) {
                  createMutation.mutate({ type: 'TRAIT', text: newText.trim() });
                }
                if (e.key === 'Escape') { setAddingType(null); setNewText(''); }
              }}
            />
            <button
              onClick={() => { if (newText.trim()) createMutation.mutate({ type: 'TRAIT', text: newText.trim() }); }}
              disabled={!newText.trim() || createMutation.isPending}
              className="btn-primary text-sm py-1.5"
            >Ekle</button>
            <button onClick={() => { setAddingType(null); setNewText(''); }} className="btn-secondary text-sm py-1.5">İptal</button>
          </div>
        )}
      </div>

      {/* NOTES */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">📝 Notlar</h2>
          {canManage && (
            <button
              id="add-note-btn"
              onClick={() => { setAddingType('NOTE'); setNewText(''); }}
              className="text-xs text-dragon-400 hover:text-dragon-300 transition-colors"
            >
              + Ekle
            </button>
          )}
        </div>

        <div className="space-y-2">
          {noteList.map((t: CharacterTrait) =>
            editingId === t.id ? (
              <div key={t.id} className="space-y-2">
                <textarea
                  className="input resize-none text-sm w-full"
                  rows={3}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => updateMutation.mutate({ id: t.id, text: editText })}
                    className="btn-primary text-sm py-1"
                  >Kaydet</button>
                  <button onClick={() => setEditingId(null)} className="btn-secondary text-sm py-1">İptal</button>
                </div>
              </div>
            ) : (
              <div
                key={t.id}
                className="group flex items-start gap-2 rounded-lg bg-dungeon-900 p-3"
              >
                <p className="flex-1 text-sm text-gray-300 whitespace-pre-wrap">{t.text}</p>
                {canManage && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button
                      onClick={() => { setEditingId(t.id); setEditText(t.text); }}
                      className="text-gray-500 hover:text-white text-xs"
                    >✏️</button>
                    <button
                      onClick={() => deleteMutation.mutate(t.id)}
                      className="text-gray-500 hover:text-red-400 text-xs"
                    >🗑️</button>
                  </div>
                )}
              </div>
            )
          )}
          {noteList.length === 0 && addingType !== 'NOTE' && (
            <p className="text-xs text-gray-600 italic">Henüz not yok.</p>
          )}
        </div>

        {/* Add note form */}
        {addingType === 'NOTE' && (
          <div className="mt-3 space-y-2">
            <textarea
              id="new-note-input"
              className="input resize-none text-sm w-full"
              rows={3}
              placeholder="Not ekle…"
              value={newText}
              autoFocus
              onChange={(e) => setNewText(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { if (newText.trim()) createMutation.mutate({ type: 'NOTE', text: newText.trim() }); }}
                disabled={!newText.trim() || createMutation.isPending}
                className="btn-primary text-sm py-1.5"
              >Kaydet</button>
              <button onClick={() => { setAddingType(null); setNewText(''); }} className="btn-secondary text-sm py-1.5">İptal</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skills ─────────────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<SkillActionType, string> = {
  ACTION: 'Aksiyon',
  BONUS_ACTION: 'Bonus Aksiyon',
  REACTION: 'Reaksiyon',
  FREE: 'Serbest',
  OTHER: 'Diğer',
};

const EMPTY_SKILL: SkillInput = {
  name: '',
  subtitle: '',
  description: '',
  skillType: '',
  range: '',
  actionType: 'ACTION',
  usesMax: 0,
  usesCurrent: 0,
};

function SkillFormModal({
  initial,
  onSave,
  onClose,
  isPending,
}: {
  initial: SkillInput;
  onSave: (data: SkillInput) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<SkillInput>(initial);
  const set = <K extends keyof SkillInput>(key: K, value: SkillInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () =>
    onSave({
      ...form,
      name: form.name.trim(),
      subtitle: form.subtitle?.trim() || null,
      skillType: form.skillType?.trim() || null,
      range: form.range?.trim() || null,
      usesCurrent: Math.min(form.usesCurrent, form.usesMax),
    });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-dungeon-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Skill</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors">✕</button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Ad</label>
              <input className="input" placeholder="Kırmızı" value={form.name}
                onChange={(e) => set('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Alt başlık</label>
              <input className="input" placeholder="yapışkan boya" value={form.subtitle ?? ''}
                onChange={(e) => set('subtitle', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Açıklama / etki</label>
            <textarea className="input resize-none w-full" rows={4} value={form.description}
              onChange={(e) => set('description', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Tür</label>
              <input className="input" placeholder="projectile" value={form.skillType ?? ''}
                onChange={(e) => set('skillType', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Menzil</label>
              <input className="input" placeholder="30 feet" value={form.range ?? ''}
                onChange={(e) => set('range', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Aksiyon</label>
              <select className="input" value={form.actionType}
                onChange={(e) => set('actionType', e.target.value as SkillActionType)}>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Kullanım hakkı</label>
              <input type="number" min={0} className="input" value={form.usesMax}
                onChange={(e) => {
                  const max = Math.max(0, Number(e.target.value));
                  setForm((f) => ({ ...f, usesMax: max, usesCurrent: Math.min(f.usesCurrent || max, max) || max }));
                }} />
              <p className="mt-1 text-xs text-gray-500">0 = sınırsız</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">İptal</button>
          <button onClick={submit} disabled={!form.name.trim() || isPending} className="btn-primary flex-1">
            {isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SkillsSection({
  sessionId,
  charId,
  canManage,
}: {
  sessionId: string;
  charId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ id: string | null; data: SkillInput } | null>(null);

  const { data: skills = [] } = useQuery({
    queryKey: ['skills', sessionId, charId],
    queryFn: () => skillsApi.list(sessionId, charId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['skills', sessionId, charId] });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string | null; data: SkillInput }) =>
      id ? skillsApi.update(sessionId, charId, id, data) : skillsApi.create(sessionId, charId, data),
    onSuccess: () => { invalidate(); setModal(null); },
  });

  const usesMutation = useMutation({
    mutationFn: ({ id, usesCurrent }: { id: string; usesCurrent: number }) =>
      skillsApi.update(sessionId, charId, id, { usesCurrent }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => skillsApi.delete(sessionId, charId, id),
    onSuccess: invalidate,
  });

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">⚔️ Skiller</h2>
        {canManage && (
          <button
            id="add-skill-btn"
            onClick={() => setModal({ id: null, data: EMPTY_SKILL })}
            className="text-xs text-dragon-400 hover:text-dragon-300 transition-colors"
          >
            + Ekle
          </button>
        )}
      </div>

      {skills.length === 0 ? (
        <p className="text-sm text-gray-600 italic">Henüz skill yok.</p>
      ) : (
        <div className="space-y-2">
          {(skills as CharacterSkill[]).map((skill) => {
            const expanded = expandedId === skill.id;
            const limited = skill.usesMax > 0;
            const empty = limited && skill.usesCurrent <= 0;

            return (
              <div key={skill.id} className="rounded-lg bg-dungeon-900 overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : skill.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="min-w-0">
                    <span className={`font-medium text-sm ${empty ? 'text-gray-500' : 'text-white'}`}>
                      {skill.name}
                    </span>
                    {skill.subtitle && (
                      <span className="ml-2 text-xs text-gray-500">({skill.subtitle})</span>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="badge bg-dragon-500/20 text-dragon-400">
                        {ACTION_LABELS[skill.actionType]}
                      </span>
                      {skill.skillType && <span className="badge bg-white/10 text-gray-300">{skill.skillType}</span>}
                      {skill.range && <span className="badge bg-white/10 text-gray-300">{skill.range}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {limited && (
                      <span className={`text-sm font-bold ${empty ? 'text-red-400' : 'text-emerald-400'}`}>
                        {skill.usesCurrent}/{skill.usesMax}
                      </span>
                    )}
                    <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-3 space-y-3 border-t border-white/5 pt-2">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{skill.description}</p>

                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        {limited && (
                          <>
                            <button
                              onClick={() => usesMutation.mutate({ id: skill.id, usesCurrent: skill.usesCurrent - 1 })}
                              disabled={empty || usesMutation.isPending}
                              className="btn-primary text-xs py-1"
                            >
                              Kullan
                            </button>
                            <button
                              onClick={() => usesMutation.mutate({ id: skill.id, usesCurrent: skill.usesMax })}
                              disabled={skill.usesCurrent === skill.usesMax || usesMutation.isPending}
                              className="btn-secondary text-xs py-1"
                            >
                              Yenile
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setModal({
                            id: skill.id,
                            data: {
                              name: skill.name,
                              subtitle: skill.subtitle,
                              description: skill.description,
                              skillType: skill.skillType,
                              range: skill.range,
                              actionType: skill.actionType,
                              usesMax: skill.usesMax,
                              usesCurrent: skill.usesCurrent,
                            },
                          })}
                          className="btn-secondary text-xs py-1"
                        >
                          ✏️ Düzenle
                        </button>
                        <button
                          onClick={() => { if (confirm(`"${skill.name}" silinsin mi?`)) deleteMutation.mutate(skill.id); }}
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                        >
                          🗑️ Sil
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <SkillFormModal
          initial={modal.data}
          isPending={saveMutation.isPending}
          onClose={() => setModal(null)}
          onSave={(data) => saveMutation.mutate({ id: modal.id, data })}
        />
      )}
    </div>
  );
}

// ── CharacterItems ─────────────────────────────────────────────────────────────
function CharacterItems({
  sessionId,
  charId,
  isDM,
}: {
  sessionId: string;
  charId: string;
  isDM: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: allItems = [] } = useQuery({
    queryKey: ['items', sessionId],
    queryFn: () => itemsApi.list(sessionId),
  });

  // Only items that belong to this character
  const myItems = (allItems as Item[]).filter((i) => i.ownerCharacterId === charId);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">🎒 Eşyalar</h2>
        {myItems.length > 0 && (
          <span className="text-xs text-gray-500">{myItems.length} eşya</span>
        )}
      </div>

      {myItems.length === 0 ? (
        <p className="text-sm text-gray-600 italic">Bu karaktere atanmış eşya yok.</p>
      ) : (
        <div className="space-y-2">
          {myItems.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <div key={item.id} className="rounded-lg bg-dungeon-900 overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="font-medium text-white text-sm">{item.name}</span>
                  <span className="text-gray-500 text-xs ml-2 shrink-0">{expanded ? '▲' : '▼'}</span>
                </button>
                {expanded && (
                  <div className="px-4 pb-3 space-y-2 border-t border-white/5 pt-2">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{item.description}</p>
                    {isDM && item.notes && (
                      <div className="rounded-md bg-dragon-500/10 border border-dragon-500/20 p-2">
                        <p className="text-xs font-medium text-dragon-400 mb-0.5">DM Notu</p>
                        <p className="text-xs text-gray-300 whitespace-pre-wrap">{item.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Character Detail Page ─────────────────────────────────────────────────────
export default function CharacterDetailPage() {
  const { sessionId, charId } = useParams<{ sessionId: string; charId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
  });

  const {
    data: character,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['character', sessionId, charId],
    queryFn: () => charactersApi.get(sessionId!, charId!),
    enabled: !!sessionId && !!charId,
  });

  // Local stat state for editing
  const [localStats, setLocalStats] = useState<StatEntry[]>([]);
  const [statsDirty, setStatsDirty] = useState(false);
  const [showEditBasic, setShowEditBasic] = useState(false);

  // Sync localStats when character loads or refreshes
  useEffect(() => {
    if (character?.stats) {
      setLocalStats(character.stats.map((s) => ({ name: s.name, value: s.value })));
      setStatsDirty(false);
    }
  }, [character]);

  const isDM = session?.role === 'DM';
  const isOwner = character?.ownerId === user?.id;
  const canEdit = isDM || isOwner; // basic info
  const canEditStats =
    isDM || (isOwner && (session?.playersCanEditStats ?? false));

  const saveStatsMutation = useMutation({
    mutationFn: () => charactersApi.upsertStats(sessionId!, charId!, localStats),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character', sessionId, charId] });
      queryClient.invalidateQueries({ queryKey: ['characters', sessionId] });
      setStatsDirty(false);
    },
  });

  function handleStatChange(name: string, value: string) {
    setLocalStats((prev) =>
      prev.map((s) => (s.name === name ? { ...s, value } : s))
    );
    setStatsDirty(true);
  }

  function handleAddStat(stat: StatEntry) {
    setLocalStats((prev) => [...prev, stat]);
    setStatsDirty(true);
  }

  function handleRemoveStat(name: string) {
    setLocalStats((prev) => prev.filter((s) => s.name !== name));
    setStatsDirty(true);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">Yükleniyor…</div>
      </div>
    );
  }

  if (isError || !character) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-5xl">📜</span>
        <p className="text-gray-400">Karakter bulunamadı.</p>
        <button onClick={() => navigate(`/sessions/${sessionId}/characters`)} className="btn-secondary">
          Karakterlere dön
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back */}
        <button
          onClick={() => navigate(`/sessions/${sessionId}/characters`)}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
        >
          ← Karakterler
        </button>

        {/* Header card */}
        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-dungeon-900 text-4xl">
                ⚔️
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{character.name}</h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="badge bg-white/10 text-gray-300">{character.class}</span>
                  <span className="text-sm text-gray-400">Seviye {character.level}</span>
                </div>
              </div>
            </div>
            {canEdit && (
              <button
                id="edit-char-basic-btn"
                onClick={() => setShowEditBasic(true)}
                className="btn-secondary text-sm shrink-0"
              >
                ✏️ Düzenle
              </button>
            )}
          </div>
        </div>

        {/* Stats card */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-white">📊 Statlar</h2>
            {canEditStats && statsDirty && (
              <button
                id="save-stats-btn"
                onClick={() => saveStatsMutation.mutate()}
                disabled={saveStatsMutation.isPending}
                className="btn-primary text-sm py-1.5"
              >
                {saveStatsMutation.isPending ? 'Kaydediliyor…' : '💾 Kaydet'}
              </button>
            )}
            {!canEditStats && !isDM && (
              <span className="text-xs text-gray-500 italic">Stat düzenleme kapalı</span>
            )}
          </div>

          {/* Stats: vertical list with modifier column */}
          <div className="space-y-2">
            {(() => {
              const ORDER = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'HP', 'AC'];
              const sorted = [...localStats].sort((a, b) => {
                const ai = ORDER.indexOf(a.name.toUpperCase());
                const bi = ORDER.indexOf(b.name.toUpperCase());
                // Known stats come first in defined order; unknowns go to the end alphabetically
                if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
              });
              return sorted;
            })().map((stat) => {
              const numVal = parseInt(stat.value, 10);
              const isAbilityScore = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].includes(stat.name.toUpperCase());
              const modifier = isAbilityScore && !isNaN(numVal)
                ? Math.floor((numVal - 10) / 2)
                : null;
              const modStr = modifier !== null
                ? (modifier >= 0 ? `+${modifier}` : `${modifier}`)
                : null;

              return (
                <div
                  key={stat.name}
                  className="group flex items-center gap-3 rounded-lg bg-dungeon-900 px-4 py-3 relative"
                >
                  {/* Stat label */}
                  <span className="w-12 shrink-0 text-xs font-bold uppercase tracking-wider text-gray-400">
                    {stat.name}
                  </span>

                  {/* Value */}
                  <div className="flex-1">
                    {canEditStats ? (
                      <input
                        id={`stat-${stat.name}`}
                        className="w-full max-w-[80px] bg-transparent text-lg font-bold text-white outline-none border-b border-transparent focus:border-dragon-500 transition-colors"
                        value={stat.value}
                        onChange={(e) => handleStatChange(stat.name, e.target.value)}
                      />
                    ) : (
                      <span className="text-lg font-bold text-white">{stat.value || '—'}</span>
                    )}
                  </div>

                  {/* Modifier badge (ability scores only) */}
                  {modStr !== null && (
                    <span
                      className={`shrink-0 w-12 text-center rounded-md py-0.5 text-sm font-bold ${modifier! > 0
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : modifier! < 0
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-white/10 text-gray-300'
                        }`}
                    >
                      {modStr}
                    </span>
                  )}

                  {/* Delete button (edit mode only) */}
                  {canEditStats && (
                    <button
                      onClick={() => handleRemoveStat(stat.name)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-sm"
                      title="Statı sil"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add custom stat */}
          {canEditStats && (
            <AddStatRow
              onAdd={handleAddStat}
              existingNames={localStats.map((s) => s.name)}
            />
          )}

          {/* Unsaved indicator */}
          {canEditStats && statsDirty && (
            <p className="mt-3 text-xs text-dragon-400">
              ⚠️ Kaydedilmemiş değişiklikler var — yukarıdaki "Kaydet" butonuna tıkla.
            </p>
          )}
        </div>

        {/* Skills */}
        <SkillsSection
          sessionId={sessionId!}
          charId={charId!}
          canManage={canEdit}
        />

        {/* Character Items */}
        <CharacterItems
          sessionId={sessionId!}
          charId={charId!}
          isDM={isDM}
        />

        {/* Traits & Notes */}
        <TraitsSection
          sessionId={sessionId!}
          charId={charId!}
          canManage={canEdit}
        />
      </div>

      {showEditBasic && character && (
        <EditBasicModal
          sessionId={sessionId!}
          charId={charId!}
          initial={{ name: character.name, class: character.class, level: character.level }}
          onClose={() => setShowEditBasic(false)}
        />
      )}
    </div>
  );
}
