import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { sessionsApi, charactersApi, traitsApi, itemsApi, skillsApi } from '../lib/api';
import type { StatEntry } from '../lib/api';
import type { CharacterTrait, Item, CharacterSkill, SkillInput, SkillActionType } from '@dnd/shared';
import { parseSkillsPdf } from '../lib/skillImportParser';
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
  error,
}: {
  initial: SkillInput;
  onSave: (data: SkillInput) => void;
  onClose: () => void;
  isPending: boolean;
  error?: string;
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

        {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}

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

function SkillsImportModal({
  sessionId,
  charId,
  onClose,
  onImported,
}: {
  sessionId: string;
  charId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [skills, setSkills] = useState<SkillInput[]>([]);
  const [error, setError] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  async function readFile(file: File) {
    setError('');
    setSkills([]);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Lütfen skill tablosunu içeren bir PDF seç.');
      return;
    }

    setLoadingFile(true);
    try {
      setSkills(await parseSkillsPdf(file));
    } catch (cause) {
      setError((cause as Error).message || 'PDF okunamadı.');
    } finally {
      setLoadingFile(false);
    }
  }

  function updateSkill(index: number, patch: Partial<SkillInput>) {
    setSkills((current) => current.map((skill, i) => i === index ? { ...skill, ...patch } : skill));
  }

  async function importSkills() {
    setImporting(true);
    setError('');
    let imported = 0;
    try {
      for (const skill of skills) {
        await skillsApi.create(sessionId, charId, {
          ...skill,
          name: skill.name.trim(),
          subtitle: skill.subtitle?.trim() || null,
          description: skill.description.trim(),
          skillType: skill.skillType?.trim() || null,
          range: skill.range?.trim() || null,
        });
        imported++;
      }
      onImported();
      onClose();
    } catch (cause) {
      if (imported > 0) setSkills((current) => current.slice(imported));
      setError(imported
        ? `${imported} skill eklendi. Kalanlar içe aktarılamadı: ${(cause as Error).message}`
        : (cause as Error).message || 'Skilller içe aktarılamadı.');
      if (imported > 0) onImported();
    } finally {
      setImporting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <div className="card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white">PDF’den skill aktar</h2>
            <p className="mt-1 text-xs text-gray-500">Skill tablosunu kontrol et, gerekirse düzenle ve karaktere ekle.</p>
          </div>
          <button onClick={onClose} disabled={importing} className="text-xl text-gray-400 hover:text-white">×</button>
        </div>

        {skills.length === 0 ? (
          <div
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void readFile(file);
            }}
            onClick={() => fileRef.current?.click()}
            className={`mt-5 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${isDragging ? 'border-dragon-500 bg-dragon-500/10' : 'border-white/10 hover:border-white/30'}`}
          >
            <p className="mb-2 text-3xl">📄</p>
            <p className="font-medium text-gray-200">PDF skill tablosunu buraya bırak</p>
            <p className="mt-1 text-sm text-gray-500">veya dosya seçmek için tıkla</p>
            <p className="mt-3 text-xs text-gray-600">Dijital metin içeren PDF’ler desteklenir.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.currentTarget.value = '';
              }}
            />
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-300">{skills.length} skill bulundu. İçe aktarmadan önce alanları gözden geçir.</p>
              <button onClick={() => { setSkills([]); setError(''); }} disabled={importing} className="shrink-0 text-xs text-dragon-400 hover:text-dragon-300">Başka PDF seç</button>
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {skills.map((skill, index) => (
                <section key={`${index}-${skill.name}`} className="rounded-lg border border-white/10 bg-dungeon-900/70 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-gray-400">
                      Skill adı
                      <input className="input mt-1" value={skill.name} onChange={(event) => updateSkill(index, { name: event.target.value })} />
                    </label>
                    <label className="text-xs text-gray-400">
                      Etki / açıklama
                      <textarea className="input mt-1 min-h-20 resize-y" value={skill.description} onChange={(event) => updateSkill(index, { description: event.target.value })} />
                    </label>
                    <label className="text-xs text-gray-400">
                      Tür
                      <input className="input mt-1" value={skill.skillType ?? ''} onChange={(event) => updateSkill(index, { skillType: event.target.value || null })} />
                    </label>
                    <label className="text-xs text-gray-400">
                      Menzil
                      <input className="input mt-1" value={skill.range ?? ''} onChange={(event) => updateSkill(index, { range: event.target.value || null })} />
                    </label>
                    <label className="text-xs text-gray-400">
                      Aksiyon
                      <select className="input mt-1" value={skill.actionType} onChange={(event) => updateSkill(index, { actionType: event.target.value as SkillActionType })}>
                        {Object.entries(ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-400">
                        Mevcut kullanım
                        <input type="number" min={0} max={skill.usesMax || undefined} className="input mt-1" value={skill.usesCurrent} onChange={(event) => updateSkill(index, { usesCurrent: Math.max(0, Number(event.target.value)) })} />
                      </label>
                      <label className="text-xs text-gray-400">
                        Toplam hak (0 = sınırsız)
                        <input type="number" min={0} className="input mt-1" value={skill.usesMax} onChange={(event) => {
                          const usesMax = Math.max(0, Number(event.target.value));
                          updateSkill(index, { usesMax, usesCurrent: usesMax === 0 ? 0 : Math.min(skill.usesCurrent, usesMax) });
                        }} />
                      </label>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        {loadingFile && <p className="mt-3 text-sm text-gray-400">PDF okunuyor…</p>}
        {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-white/10 pt-4">
          <button onClick={onClose} disabled={importing} className="btn-secondary">Kapat</button>
          {skills.length > 0 && <button onClick={() => void importSkills()} disabled={importing || skills.some((skill) => !skill.name.trim() || !skill.description.trim())} className="btn-primary">
            {importing ? 'Ekleniyor…' : `${skills.length} skilli içe aktar`}
          </button>}
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
  const [showImport, setShowImport] = useState(false);

  const { data: skills = [], isLoading, isError, error, refetch } = useQuery({
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

  const mutationError = usesMutation.error ?? deleteMutation.error;

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">⚔️ Skiller</h2>
        {canManage && (
          <div className="flex items-center gap-3">
            <button onClick={() => setShowImport(true)} className="text-xs text-gray-300 hover:text-white transition-colors">
              PDF’den aktar
            </button>
            <button
              id="add-skill-btn"
              onClick={() => setModal({ id: null, data: EMPTY_SKILL })}
              className="text-xs text-dragon-400 hover:text-dragon-300 transition-colors"
            >
              + Ekle
            </button>
          </div>
        )}
      </div>

      {mutationError && (
        <p role="alert" className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {mutationError.message || 'Skill işlemi tamamlanamadı.'}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Skiller yükleniyor…</p>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          <p>Skiller yüklenemedi: {(error as Error).message}</p>
          <button onClick={() => refetch()} className="mt-2 underline">Tekrar dene</button>
        </div>
      ) : skills.length === 0 ? (
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
          error={saveMutation.error?.message}
          onClose={() => setModal(null)}
          onSave={(data) => saveMutation.mutate({ id: modal.id, data })}
        />
      )}
      {showImport && (
        <SkillsImportModal
          sessionId={sessionId}
          charId={charId}
          onClose={() => setShowImport(false)}
          onImported={invalidate}
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
  const itemGroups = [
    { category: 'COMBAT' as const, label: '\u0053ava\u015f e\u015fyalar\u0131', items: myItems.filter((item) => item.category === 'COMBAT') },
    { category: 'QUEST' as const, label: 'G\u00f6rev e\u015fyalar\u0131', items: myItems.filter((item) => item.category === 'QUEST') },
  ];

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">🎒 Eşyalar</h2>
        {myItems.length > 0 && (
          <span className="text-xs text-gray-500">{myItems.length} eşya</span>
        )}
      </div>

      {myItems.length === 0 && <p className="text-sm text-gray-600 italic">{"Bu karaktere atanm\u0131\u015f e\u015fya yok."}</p>}
      <div className="space-y-4">
        {itemGroups.map((group) => <section key={group.category}>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-300">{group.label}</h3><span className="text-xs text-gray-500">{group.items.length}</span></div>
          {group.items.length === 0 ? <p className="rounded-lg bg-dungeon-900/60 px-3 py-2 text-xs text-gray-600">{"Bu grupta e\u015fya yok."}</p> : <div className="space-y-2">
          {group.items.map((item) => {
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
          </div>}
        </section>)}
      </div>
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
  const [editingGold, setEditingGold] = useState(false);

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

  const normalizedStats = localStats.map((stat) => ({
    ...stat,
    normalizedName: stat.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
  }));
  const isGoldStat = (name: string) => ['GOLD', 'ALTIN', 'GP', 'PARA'].includes(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const getQuickStat = (aliases: string[]) => normalizedStats.find((stat) => aliases.includes(stat.normalizedName));

  const saveStatsMutation = useMutation({
    mutationFn: () => charactersApi.upsertStats(sessionId!, charId!, localStats),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character', sessionId, charId] });
      queryClient.invalidateQueries({ queryKey: ['characters', sessionId] });
      setStatsDirty(false);
      setEditingGold(false);
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

  const goldStat = getQuickStat(['GOLD', 'ALTIN', 'GP', 'PARA']);
  const quickStats = [
    { label: 'Can', stat: getQuickStat(['HP', 'CAN', 'HITPOINTS']), accent: 'text-red-300' },
    { label: 'Zırh sınıfı', stat: getQuickStat(['AC', 'ZS', 'ARMORCLASS']), accent: 'text-sky-300' },
    { label: 'Altın', stat: goldStat, accent: 'text-amber-300' },
    { label: 'Ok', stat: getQuickStat(['ARROW', 'ARROWS', 'OK', 'OKLAR', 'MUNITION']), accent: 'text-emerald-300' },
  ].filter((item) => item.stat || item.label === 'Altın');
  const sections = [
    { id: 'combat', label: 'Savaş & Statlar' },
    { id: 'skills', label: 'Yetenekler' },
    { id: 'inventory', label: 'Envanter' },
    { id: 'journal', label: 'Özellikler & Notlar' },
  ];

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        {/* Navigation */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={() => navigate(`/sessions/${sessionId}/workspace`)}
            className="text-sm text-dragon-400 hover:text-dragon-300 transition-colors flex items-center gap-1"
          >
            ← {isDM ? 'DM çalışma alanı' : 'Çalışma alanım'}
          </button>
          <button
            onClick={() => navigate(`/sessions/${sessionId}/characters`)}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            Karakterlere dön
          </button>
        </div>

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

        {quickStats.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickStats.map(({ label, stat, accent }) => <div key={label} className="card !p-4">
            <p className="text-xs font-medium text-gray-500">{label}</p>
            {label === 'Altın' ? <div className="mt-1 flex items-center gap-1.5">
              {editingGold && canEditStats && stat ? <input autoFocus aria-label="Altın miktarı" className={`w-full min-w-0 bg-transparent text-2xl font-bold outline-none ${accent}`} value={stat.value} onChange={(event) => handleStatChange(stat.name, event.target.value)} />
                : <p className={`text-2xl font-bold ${accent}`}>{stat?.value || '—'}</p>}
              {canEditStats && <button type="button" aria-label="Altın miktarını düzenle" title="Altını düzenle" onClick={() => {
                if (!stat) handleAddStat({ name: 'GOLD', value: '0' });
                setEditingGold(true);
              }} className="shrink-0 text-sm text-amber-200/70 hover:text-amber-100">✏️</button>}
              {editingGold && canEditStats && statsDirty && <button onClick={() => saveStatsMutation.mutate()} disabled={saveStatsMutation.isPending} className="shrink-0 text-xs text-amber-200 hover:text-amber-100 disabled:opacity-40">
                {saveStatsMutation.isPending ? '…' : 'Kaydet'}
              </button>}
            </div> : <p className={`mt-1 text-2xl font-bold ${accent}`}>{stat?.value || '—'}</p>}
          </div>)}
        </div>}

        <nav aria-label="Sayfa içi hızlı geçiş" className="sticky top-0 z-20 -mx-4 flex gap-2 overflow-x-auto border-y border-white/10 bg-dungeon-950/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
          {sections.map((section) => <a key={section.id} href={`#${section.id}`}
            className="shrink-0 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
            {section.label}
          </a>)}
        </nav>

        <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
        {/* Stats card */}
        <section id="combat" className="card scroll-mt-20">
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
              const sorted = localStats.filter((stat) => !isGoldStat(stat.name)).sort((a, b) => {
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
        </section>

        {/* Skills */}
        <section id="skills" className="scroll-mt-20">
        <SkillsSection
          sessionId={sessionId!}
          charId={charId!}
          canManage={canEdit}
        />
        </section>
        </div>

        {/* Character Items */}
        <div className="space-y-5">
        <section id="inventory" className="scroll-mt-20">
        <CharacterItems
          sessionId={sessionId!}
          charId={charId!}
          isDM={isDM}
        />
        </section>

        {/* Traits & Notes */}
        <section id="journal" className="scroll-mt-20">
        <TraitsSection
          sessionId={sessionId!}
          charId={charId!}
          canManage={canEdit}
        />
        </section>
        </div>
        </div>
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
