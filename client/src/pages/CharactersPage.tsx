import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import type { Character } from '@dnd/shared';
import type { CreateCharacterPayload } from '../lib/api';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { parseFile } from '../lib/importParser';
import type { ParsedCharacter } from '../lib/importParser';
import { sessionsApi, charactersApi, itemsApi } from '../lib/api';

// ── Create Character Modal ────────────────────────────────────────────────────
function CreateCharacterModal({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [charClass, setCharClass] = useState('');
  const [level, setLevel] = useState(1);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: CreateCharacterPayload) =>
      charactersApi.create(sessionId, data),
    onSuccess: (char) => {
      queryClient.invalidateQueries({ queryKey: ['characters', sessionId] });
      onClose();
      navigate(`/sessions/${sessionId}/characters/${char.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Karakter Oluştur</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors">✕</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Karakter Adı *</label>
            <input
              id="char-name-input"
              className="input"
              placeholder="Örn: Aria Moonwhisper"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Sınıf *</label>
            <input
              id="char-class-input"
              className="input"
              placeholder="Örn: Savaşçı, Büyücü, Paladin…"
              value={charClass}
              onChange={(e) => setCharClass(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Seviye</label>
            <input
              id="char-level-input"
              type="number"
              min={1}
              max={20}
              className="input"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">İptal</button>
          <button
            id="create-char-submit"
            onClick={() => mutation.mutate({ name, class: charClass, level })}
            disabled={!name.trim() || !charClass.trim() || mutation.isPending}
            className="btn-primary flex-1"
          >
            {mutation.isPending ? 'Oluşturuluyor…' : 'Oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Class Badge ───────────────────────────────────────────────────────────────
const CLASS_COLORS: Record<string, string> = {
  savaşçı: 'bg-orange-500/20 text-orange-400',
  paladin: 'bg-yellow-500/20 text-yellow-300',
  barbar: 'bg-red-500/20 text-red-400',
  büyücü: 'bg-purple-500/20 text-purple-400',
  sihirbaz: 'bg-blue-500/20 text-blue-400',
  kehanet: 'bg-cyan-500/20 text-cyan-400',
  rahip: 'bg-green-500/20 text-green-400',
  hırsız: 'bg-gray-500/20 text-gray-400',
};

function classBadgeColor(cls: string) {
  return CLASS_COLORS[cls.toLowerCase()] ?? 'bg-white/10 text-gray-300';
}

// ── Character Card ────────────────────────────────────────────────────────────
function CharacterCard({
  character,
  sessionId,
  isDM,
  isOwner,
}: {
  character: Character & { owner?: { id: string; displayName: string } };
  sessionId: string;
  isDM: boolean;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => charactersApi.delete(sessionId, character.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['characters', sessionId] }),
  });

  return (
    <div
      id={`char-card-${character.id}`}
      className="card flex items-center gap-4 transition-all hover:border-white/20"
    >
      {/* Avatar */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-dungeon-900 text-2xl">
        ⚔️
      </div>

      {/* Info */}
      <Link
        to={`/sessions/${sessionId}/characters/${character.id}`}
        className="flex-1 min-w-0"
      >
        <p className="font-semibold text-white truncate">{character.name}</p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className={`badge ${classBadgeColor(character.class)}`}>
            {character.class}
          </span>
          <span className="text-xs text-gray-500">Sv. {character.level}</span>
          {character.owner && (
            <span className="text-xs text-gray-500">— {character.owner.displayName}</span>
          )}
        </div>
        {/* Quick stats preview */}
        {character.stats && character.stats.length > 0 && (
          <div className="mt-2 flex gap-3 flex-wrap">
            {character.stats.slice(0, 6).map((s) => (
              <div key={s.id} className="text-center">
                <p className="text-[10px] font-medium uppercase text-gray-500">{s.name}</p>
                <p className="text-xs font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </Link>

      {/* Actions */}
      {(isDM || isOwner) && (
        <div className="shrink-0">
          {confirming && isDM ? (
            <div className="flex flex-col gap-1 items-end">
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-xs text-red-400 hover:text-red-300 font-medium"
              >
                {deleteMutation.isPending ? '…' : 'Sil'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                İptal
              </button>
            </div>
          ) : isDM ? (
            <button
              id={`delete-char-${character.id}`}
              onClick={() => setConfirming(true)}
              className="text-gray-500 hover:text-red-400 transition-colors text-sm"
              title="Sil"
            >
              🗑️
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Characters Page ────────────────────────────────────────────────────────────
export default function CharactersPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Realtime: listens for character events and invalidates cache automatically
  useSessionSocket(sessionId);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
  });

  const { data: characters, isLoading, isError } = useQuery({
    queryKey: ['characters', sessionId],
    queryFn: () => charactersApi.list(sessionId!),
    enabled: !!sessionId,
  });

  const isDM = session?.role === 'DM';

  // Player can create a character only if they don't have one yet
  const userCharacter = characters?.find((c) => c.ownerId === user?.id);
  const canCreate = isDM || !userCharacter;

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
              📜 Karakterler
              {characters && (
                <span className="text-base font-normal text-gray-500">({characters.length})</span>
              )}
            </h1>
            {canCreate && (
              <button
                id="import-chars-btn"
                onClick={() => setShowImport(true)}
                className="btn-secondary text-sm"
              >
                📂 İçe Aktar
              </button>
            )}
            {canCreate && (
              <button
                id="create-char-btn"
                onClick={() => setShowCreate(true)}
                className="btn-primary text-sm"
              >
                + Karakter Oluştur
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="card animate-pulse h-24 bg-dungeon-800/40" />
            ))}
          </div>
        )}

        {isError && (
          <div className="card text-center text-red-400 py-8">
            Karakterler yüklenemedi. Lütfen tekrar deneyin.
          </div>
        )}

        {!isLoading && !isError && characters?.length === 0 && (
          <div className="card flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">📜</span>
            <h2 className="text-lg font-semibold text-white">Henüz karakter yok</h2>
            <p className="text-gray-400">İlk karakterini oluşturmak için butona tıkla.</p>
          </div>
        )}

        {characters && characters.length > 0 && (
          <div className="space-y-3">
            {characters.map((char) => (
              <CharacterCard
                key={char.id}
                character={char as Character & { owner: { id: string; displayName: string } }}
                sessionId={sessionId!}
                isDM={isDM ?? false}
                isOwner={char.ownerId === user?.id}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && sessionId && (
        <CreateCharacterModal sessionId={sessionId} onClose={() => setShowCreate(false)} />
      )}
      {showImport && sessionId && (
        <ImportModal sessionId={sessionId} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

// ── ImportModal ────────────────────────────────────────────────────────────────────
function ImportModal({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [chars, setChars] = useState<ParsedCharacter[]>([]);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  async function handleFile(file: File) {
    setError('');
    setChars([]);
    setDone(false);
    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) {
        setError('Dosyada işlenebilir karakter bulunamadı.');
      } else {
        setChars(parsed);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleImport() {
    setImporting(true);
    setError('');
    try {
      for (const c of chars) {
        if (!c.name) continue;

        // 1. Create the character (server merges stats over defaults, saves notes as traits)
        const created = await charactersApi.create(sessionId, {
          name: c.name,
          class: c.class || 'Bilinmiyor',
          level: c.level || 1,
          stats: c.stats.length > 0 ? c.stats : undefined,
          notes: c.notes.filter((n) => n.trim()).length > 0
            ? c.notes.filter((n) => n.trim())
            : undefined,
          traits: c.traits.filter((trait) => trait.trim()).length > 0
            ? c.traits.filter((trait) => trait.trim())
            : undefined,
        });

        // 2. Create each inventory item linked to the character
        for (const item of c.items) {
          if (!item.name.trim()) continue;
          await itemsApi.create(sessionId, {
            name: item.name.trim(),
            description: item.notes || '',
            ownerCharacterId: (created as import('@dnd/shared').Character).id,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['characters', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['items', sessionId] });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-white">📂 Karakter İçe Aktar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
        </div>

        {done ? (
          <div className="text-center space-y-4 py-6">
            <div className="text-5xl">✅</div>
            <p className="text-white font-semibold">{chars.length} karakter başarıyla aktarıldı!</p>
            <button onClick={onClose} className="btn-primary">Kapat</button>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            {chars.length === 0 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${isDragging ? 'border-dragon-500 bg-dragon-500/10' : 'border-white/10 hover:border-white/30'
                  }`}
              >
                <p className="text-4xl mb-3">📄</p>
                <p className="text-gray-300 font-medium">Dosyayı buraya sürükle</p>
                <p className="text-gray-500 text-sm mt-1">ya da tıklayarak seç</p>
                <p className="text-gray-600 text-xs mt-3">.txt &nbsp;·&nbsp; .pdf &nbsp;·&nbsp; .csv &nbsp;·&nbsp; .xlsx &nbsp;·&nbsp; .xls</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.pdf,.csv,.xlsx,.xls,application/pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
            )}

            {/* Format hint */}
            {chars.length === 0 && (
              <details className="mt-3 text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-300">Desteklenen formatlar →</summary>
                <div className="mt-2 space-y-2 rounded-lg bg-dungeon-900 p-3">
                  <p className="font-medium text-gray-400">TXT — her karakteri boş satırla ayır:</p>
                  <pre className="text-gray-500 whitespace-pre-wrap">{`İsim: Aragorn\nSınıf: Savaşçı\nSeviye: 15\nSTR: 18\nDEX: 14\nHP: 120`}</pre>
                  <p className="font-medium text-gray-400 mt-2">CSV / Excel — sütun başlıkları:</p>
                  <pre className="text-gray-500">name, class, level, STR, DEX, CON, INT, WIS, CHA, HP, AC</pre>
                </div>
              </details>
            )}

            {/* Error */}
            {error && (
              <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Preview */}
            {chars.length > 0 && (
              <>
                <p className="text-sm text-gray-400 mb-3">
                  {chars.length} karakter bulundu — kontrol edip onayla:
                </p>
                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                  {chars.map((c, i) => (
                    <div key={i} className="rounded-lg bg-dungeon-900 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">
                          {c.name || <span className="text-red-400 italic">İsim eksik</span>}
                        </span>
                        <span className="text-xs text-gray-500">
                          {c.class} &nbsp;·&nbsp; Sv.{c.level}
                        </span>
                      </div>
                      {c.stats.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {c.stats.map((s) => (
                            <span key={s.name} className="badge bg-white/10 text-gray-300">
                              {s.name}: {s.value}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.traits.length > 0 && (
                        <div className="mt-1.5">
                          <p className="mb-1 text-[10px] font-medium uppercase text-gray-500">Özellikler</p>
                          <div className="flex flex-wrap gap-1.5">
                            {c.traits.map((trait, idx) => <span key={`${trait}-${idx}`} className="badge bg-dragon-500/20 text-dragon-300">{trait}</span>)}
                          </div>
                        </div>
                      )}
                      {c.notes.length > 0 && (
                        <div className="mt-1.5">
                          <p className="mb-1 text-[10px] font-medium uppercase text-gray-500">Notlar</p>
                          <div className="flex flex-wrap gap-1.5">{c.notes.map((note, idx) => <span key={`${note}-${idx}`} className="badge bg-white/10 text-gray-300">{note}</span>)}</div>
                        </div>
                      )}
                      {c.items.length > 0 && (
                        <div className="mt-1.5">
                          <p className="text-[10px] font-medium uppercase text-gray-500 mb-1">⚔️ Eşyalar</p>
                          <div className="flex flex-wrap gap-1.5">
                            {c.items.map((item, idx) => (
                              <span key={idx} className="badge bg-yellow-500/15 text-yellow-300">
                                {item.name}{item.notes ? ` — ${item.notes}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {!c.name && c.rawLines && (
                        <p className="text-xs text-red-400 mt-1">⚠️ İsim alanı bulunamadı — bu karakter atlanacak</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-3 shrink-0">
                  <button
                    onClick={() => { setChars([]); setError(''); }}
                    className="btn-secondary flex-1"
                  >
                    Değiştir
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || chars.every((c) => !c.name)}
                    className="btn-primary flex-1"
                  >
                    {importing ? 'Aktarılıyor…' : `${chars.filter((c) => c.name).length} Karakter Aktar`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
