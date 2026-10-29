import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LogbookEntry, LogbookEntryInput } from '@dnd/shared';
import { logbookApi, sessionsApi } from '../lib/api';
import { useSessionSocket } from '../hooks/useSessionSocket';

function localDateInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const EMPTY_FORM: LogbookEntryInput = {
  title: '', summary: '', currentStatus: '', sessionDate: localDateInput(),
};

export default function LogbookPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LogbookEntryInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  useSessionSocket(sessionId);

  const { data: session, isLoading: sessionLoading, isError: sessionError } = useQuery({
    queryKey: ['session', sessionId], queryFn: () => sessionsApi.get(sessionId!), enabled: !!sessionId,
  });
  const { data: entries = [], isLoading: entriesLoading, isError: entriesError } = useQuery({
    queryKey: ['logbook', sessionId], queryFn: () => logbookApi.list(sessionId!), enabled: !!sessionId,
  });
  const isDM = session?.role === 'DM';
  const saveEntry = useMutation({
    mutationFn: () => editingId
      ? logbookApi.update(sessionId!, editingId, form)
      : logbookApi.create(sessionId!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logbook', sessionId] });
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFormOpen(false);
    },
  });
  const deleteEntry = useMutation({
    mutationFn: (id: string) => logbookApi.delete(sessionId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logbook', sessionId] }),
  });

  function openNewEntry() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sessionDate: localDateInput() });
    setFormOpen(true);
    saveEntry.reset();
  }

  function openEditEntry(entry: LogbookEntry) {
    setEditingId(entry.id);
    setForm({ title: entry.title, summary: entry.summary, currentStatus: entry.currentStatus, sessionDate: entry.sessionDate.slice(0, 10) });
    setFormOpen(true);
    saveEntry.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveEntry.mutate();
  }

  if (sessionLoading || entriesLoading) return <div className="flex min-h-screen items-center justify-center text-gray-400">Oturum günlüğü yükleniyor…</div>;
  if (sessionError || !session || !sessionId) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-gray-400"><p>Oturum bulunamadı veya erişim yetkin yok.</p><button onClick={() => navigate('/dashboard')} className="btn-secondary">Dashboard’a dön</button></div>;

  const latest = entries[0];

  return <main className="min-h-screen p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={`/sessions/${sessionId}/workspace`} className="text-sm text-gray-500 hover:text-gray-300">← Çalışma alanı</Link>
          <div className="mt-3 flex items-center gap-2"><span className={isDM ? 'badge-dm' : 'badge-player'}>{isDM ? 'DM' : 'Oyuncu'}</span><span className="text-sm text-gray-500">{session.name}</span></div>
          <h1 className="mt-2 text-3xl font-bold text-white">📖 Oturum günlüğü</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">Geçen oturumda neler olduğunu ve maceranın nerede kaldığını buradan hatırlayın.</p>
        </div>
        {isDM && <button onClick={openNewEntry} className="btn-primary">+ Oturum kaydı ekle</button>}
      </header>

      {entriesError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Oturum kayıtları yüklenemedi. Sayfayı yenileyip tekrar dene.</p>}

      {latest ? <section className="card border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-dungeon-800 to-dungeon-900">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="badge bg-emerald-500/15 text-emerald-300">EN SON OTURUM · {displayDate(latest.sessionDate)}</span><span className="text-xs text-gray-500">{latest.title}</span></div>
        {latest.currentStatus ? <><h2 className="mt-4 text-lg font-semibold text-white">En son burada kaldık</h2><p className="mt-2 whitespace-pre-wrap leading-relaxed text-gray-200">{latest.currentStatus}</p></> : <p className="mt-4 text-sm text-gray-400">Bu kayıt için henüz bir “nerede kaldık” notu eklenmemiş.</p>}
        {isDM && <button onClick={() => openEditEntry(latest)} className="mt-4 text-sm text-emerald-300 hover:text-emerald-200">Bu bilgiyi düzenle →</button>}
      </section> : <section className="card border-emerald-500/15 bg-emerald-500/5"><h2 className="font-semibold text-white">Maceranız burada başlayacak</h2><p className="mt-2 text-sm leading-relaxed text-gray-400">İlk oturum kaydı eklendiğinde özet ve en son nerede kaldığınız burada görünecek.</p>{isDM && <button onClick={openNewEntry} className="mt-4 text-sm font-medium text-emerald-300 hover:text-emerald-200">İlk oturum kaydını ekle →</button>}</section>}

      {formOpen && isDM && <form onSubmit={submit} className="card space-y-4 border-dragon-500/30">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">{editingId ? 'Oturum kaydını düzenle' : 'Yeni oturum kaydı'}</h2><p className="mt-1 text-xs text-gray-500">Bu notu oturumun tüm oyuncuları görebilir.</p></div><button type="button" aria-label="Formu kapat" onClick={() => { setFormOpen(false); setEditingId(null); saveEntry.reset(); }} className="text-xl leading-none text-gray-500 hover:text-white">×</button></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <label className="text-xs text-gray-400">Kayıt başlığı<input required maxLength={120} className="input mt-1" placeholder="Örn. Eski madenin altında" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <label className="text-xs text-gray-400">Oturum tarihi<input required type="date" className="input mt-1" value={form.sessionDate} onChange={(event) => setForm((current) => ({ ...current, sessionDate: event.target.value }))} /></label>
        </div>
        <label className="block text-xs text-gray-400">Bu oturumda neler oldu?<textarea required maxLength={10000} rows={6} className="input mt-1 resize-y" placeholder="Önemli olayları, kararları, bulunan ipuçlarını ve karakterlerin yaptıklarını özetle…" value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} /></label>
        <label className="block text-xs text-gray-400">En son nerede kaldık?<textarea maxLength={3000} rows={3} className="input mt-1 resize-y" placeholder="Örn. Grup, kuzey kapısındaki muhafızlarla yüzleşmek üzere…" value={form.currentStatus} onChange={(event) => setForm((current) => ({ ...current, currentStatus: event.target.value }))} /></label>
        {saveEntry.isError && <p role="alert" className="text-sm text-red-300">Kayıt kaydedilemedi: {saveEntry.error.message}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => { setFormOpen(false); setEditingId(null); saveEntry.reset(); }} className="btn-secondary">İptal</button><button type="submit" disabled={saveEntry.isPending} className="btn-primary">{saveEntry.isPending ? 'Kaydediliyor…' : editingId ? 'Değişiklikleri kaydet' : 'Kaydı ekle'}</button></div>
      </form>}

      <section className="space-y-4">
        <div><h2 className="text-lg font-semibold text-white">Geçmiş oturumlar</h2><p className="mt-1 text-xs text-gray-500">En yeni kayıt üstte görünür.</p></div>
        {entries.length === 0 ? <div className="card py-10 text-center"><p className="text-sm text-gray-400">Henüz oturum günlüğü yok.</p>{!isDM && <p className="mt-1 text-xs text-gray-600">DM’in ilk özeti eklediğinde burada görebilirsin.</p>}</div> : <ol className="space-y-3">
          {entries.map((entry, index) => <li key={entry.id} className="card relative overflow-hidden">
            {index === 0 && <span className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />}
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-dragon-300">{displayDate(entry.sessionDate)}{index === 0 ? ' · En son' : ''}</p><h3 className="mt-1 text-lg font-semibold text-white">{entry.title}</h3></div>{isDM && <div className="flex shrink-0 gap-3 text-sm"><button onClick={() => openEditEntry(entry)} className="text-dragon-300 hover:text-dragon-200">Düzenle</button><button disabled={deleteEntry.isPending} onClick={() => { if (confirm(`“${entry.title}” kaydı silinsin mi?`)) deleteEntry.mutate(entry.id); }} className="text-gray-500 hover:text-red-300">Sil</button></div>}</div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{entry.summary}</p>
            {entry.currentStatus && <div className="mt-4 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Oturum sonunda</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{entry.currentStatus}</p></div>}
            {isDM && <p className="mt-3 text-right text-[11px] text-gray-600">Son düzenleme: {new Date(entry.updatedAt).toLocaleString('tr-TR')}</p>}
          </li>)}
        </ol>}
      </section>
    </div>
  </main>;
}
