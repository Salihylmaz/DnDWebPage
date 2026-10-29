import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi, itemsApi, charactersApi } from '../lib/api';
import type { Item } from '@dnd/shared';
import type { CreateItemPayload, UpdateItemPayload } from '../lib/api';
import { useSessionSocket } from '../hooks/useSessionSocket';

// ── Item Form (used in both create and edit modals) ───────────────────────────
function ItemForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
  sessionId,
}: {
  initial?: Partial<Item>;
  onSubmit: (data: CreateItemPayload) => void;
  onCancel: () => void;
  isPending: boolean;
  sessionId: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [category, setCategory] = useState<'COMBAT' | 'QUEST'>(initial?.category ?? 'COMBAT');
  const [ownerCharacterId, setOwnerCharacterId] = useState<string>(
    initial?.ownerCharacterId ?? ''
  );

  // Fetch characters to populate the dropdown
  const { data: characters = [] } = useQuery({
    queryKey: ['characters', sessionId],
    queryFn: () => charactersApi.list(sessionId),
  });

  const valid = name.trim().length > 0 && description.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">Eşya Adı *</label>
        <input
          id="item-name-input"
          className="input"
          placeholder="Örn: Ejderha Kılıcı"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">Açıklama *</label>
        <textarea
          id="item-description-input"
          className="input resize-none"
          rows={3}
          placeholder="Bu eşya ne yapar?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">Eşya Türü</label>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as 'COMBAT' | 'QUEST')}>
          <option value="COMBAT">Savaş eşyası</option>
          <option value="QUEST">Görev eşyası</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          DM Notları <span className="text-gray-500 font-normal">(isteğe bağlı)</span>
        </label>
        <textarea
          id="item-notes-input"
          className="input resize-none"
          rows={2}
          placeholder="Gizli notlar, köken hikayesi…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Karakter <span className="text-gray-500 font-normal">(isteğe bağlı)</span>
        </label>
        <select
          id="item-owner-select"
          className="input"
          value={ownerCharacterId}
          onChange={(e) => setOwnerCharacterId(e.target.value)}
        >
          <option value="">— Atanmamış —</option>
          {(characters as import('@dnd/shared').Character[]).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.class})
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="btn-secondary flex-1">İptal</button>
        <button
          id="item-form-submit"
          onClick={() => onSubmit({
            name,
            description,
            notes: notes || undefined,
            ownerCharacterId: ownerCharacterId || null,
            category,
          })}
          disabled={!valid || isPending}
          className="btn-primary flex-1"
        >
          {isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}

// ── Create Item Modal ─────────────────────────────────────────────────────────
function CreateItemModal({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: CreateItemPayload) => itemsApi.create(sessionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', sessionId] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Yeni Eşya Ekle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <ItemForm
          sessionId={sessionId}
          onSubmit={(data) => mutation.mutate(data)}
          onCancel={onClose}
          isPending={mutation.isPending}
        />
      </div>
    </div>
  );
}

// ── Edit Item Modal ───────────────────────────────────────────────────────────
function EditItemModal({
  sessionId,
  item,
  onClose,
}: {
  sessionId: string;
  item: Item;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: UpdateItemPayload) => itemsApi.update(sessionId, item.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', sessionId] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Eşyayı Düzenle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <ItemForm
          sessionId={sessionId}
          initial={item}
          onSubmit={(data) => mutation.mutate(data)}
          onCancel={onClose}
          isPending={mutation.isPending}
        />
      </div>
    </div>
  );
}

// ── Item Card ─────────────────────────────────────────────────────────────────
function ItemCard({
  item,
  isDM,
  sessionId,
  onEdit,
}: {
  item: Item;
  isDM: boolean;
  sessionId: string;
  onEdit: (item: Item) => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => itemsApi.delete(sessionId, item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items', sessionId] }),
  });

  return (
    <div
      id={`item-card-${item.id}`}
      className="card transition-all hover:border-white/20"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full text-left"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{item.name}</h3>
              <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
            </div>
            {!expanded && (
              <p className="mt-1 text-sm text-gray-400 line-clamp-2">{item.description}</p>
            )}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Açıklama</p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{item.description}</p>
              </div>
              {isDM && item.notes && (
                <div className="rounded-lg bg-dragon-500/10 border border-dragon-500/20 p-3">
                  <p className="text-xs font-medium text-dragon-400 uppercase tracking-wider mb-1">DM Notları</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{item.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {isDM && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              id={`edit-item-${item.id}`}
              onClick={() => onEdit(item)}
              className="p-1.5 text-gray-500 hover:text-white transition-colors rounded"
              title="Düzenle"
            >
              ✏️
            </button>
            {confirming ? (
              <div className="flex gap-1">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 text-red-400 hover:text-red-300 transition-colors rounded text-xs font-medium"
                >
                  Sil
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors rounded text-xs"
                >
                  İptal
                </button>
              </div>
            ) : (
              <button
                id={`delete-item-${item.id}`}
                onClick={() => setConfirming(true)}
                className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded"
                title="Sil"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Items Page ────────────────────────────────────────────────────────────────
export default function ItemsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  // Realtime: listens for item events and invalidates cache automatically
  useSessionSocket(sessionId);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // Simple debounce for search
  const handleSearch = useCallback((value: string) => {
    setQ(value);
    const timer = setTimeout(() => setDebouncedQ(value), 300);
    return () => clearTimeout(timer);
  }, []);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
  });

  const { data: items, isLoading, isError } = useQuery({
    queryKey: ['items', sessionId, debouncedQ],
    queryFn: () => itemsApi.list(sessionId!, debouncedQ || undefined),
    enabled: !!sessionId,
  });

  const isDM = session?.role === 'DM';

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate(`/sessions/${sessionId}`)}
            className="mb-4 text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            ← {session?.name ?? 'Oturuma dön'}
          </button>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              🎒 Eşyalar
              {items && (
                <span className="text-base font-normal text-gray-500">({items.length})</span>
              )}
            </h1>
            {isDM && (
              <button
                id="add-item-btn"
                onClick={() => setShowCreate(true)}
                className="btn-primary text-sm"
              >
                + Eşya Ekle
              </button>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          <input
            id="items-search"
            className="input pl-9"
            placeholder="Eşya ara…"
            value={q}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {q && (
            <button
              onClick={() => { setQ(''); setDebouncedQ(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Items list */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="card animate-pulse h-20 bg-dungeon-800/40" />
            ))}
          </div>
        )}

        {isError && (
          <div className="card text-center text-red-400 py-8">
            Eşyalar yüklenemedi. Lütfen tekrar deneyin.
          </div>
        )}

        {!isLoading && !isError && items?.length === 0 && (
          <div className="card flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">🎒</span>
            {debouncedQ ? (
              <>
                <h2 className="text-lg font-semibold text-white">Sonuç bulunamadı</h2>
                <p className="text-gray-400">"{debouncedQ}" için eşya bulunamadı.</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-white">Henüz eşya yok</h2>
                {isDM ? (
                  <p className="text-gray-400">İlk eşyayı eklemek için yukarıdaki butona tıkla.</p>
                ) : (
                  <p className="text-gray-400">DM henüz eşya eklemedi.</p>
                )}
              </>
            )}
          </div>
        )}

        {items && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                isDM={isDM ?? false}
                sessionId={sessionId!}
                onEdit={setEditingItem}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && sessionId && (
        <CreateItemModal sessionId={sessionId} onClose={() => setShowCreate(false)} />
      )}
      {editingItem && sessionId && (
        <EditItemModal
          sessionId={sessionId}
          item={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
