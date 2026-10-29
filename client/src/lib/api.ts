import type { User, Session, SessionMember, Item, Character, CharacterStat, CharacterTrait, CharacterSkill, SkillInput, SessionCreature, SessionCreatureInput, SessionCombatState, SessionCombatInput, LogbookEntry, LogbookEntryInput, ApiSuccess, ApiError } from '@dnd/shared';

// ── Base fetch wrapper ────────────────────────────────────────────────────────
// All requests go through /api (proxied to Express in dev, Nginx in prod).
// Credentials: 'include' is required to send/receive httpOnly cookies.

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const body = await res.json() as ApiSuccess<T> | ApiError;

  if (!res.ok) {
    const message = (body as ApiError).error ?? 'Bir hata oluştu';
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  return (body as ApiSuccess<T>).data;
}

// ── Auth endpoints ────────────────────────────────────────────────────────────
export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const authApi = {
  register: (data: RegisterPayload) =>
    apiFetch<{ message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: LoginPayload) =>
    apiFetch<User>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  googleLogin: (credential: string) =>
    apiFetch<User>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),

  verifyEmail: (token: string) =>
    apiFetch<User>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),

  resendVerification: (email: string) =>
    apiFetch<{ message: string }>('/auth/resend-verification', {
      method: 'POST', body: JSON.stringify({ email }),
    }),

  logout: () =>
    apiFetch<{ message: string }>('/auth/logout', { method: 'POST' }),

  me: () => apiFetch<User>('/auth/me'),
};

// ── Session endpoints ─────────────────────────────────────────────────────────
export type SessionWithRole = Session & { role: 'DM' | 'PLAYER' };

export const sessionsApi = {
  list: () => apiFetch<SessionWithRole[]>('/sessions'),

  get: (sessionId: string) =>
    apiFetch<SessionWithRole>(`/sessions/${sessionId}`),

  create: (data: { name: string; description?: string }) =>
    apiFetch<Session>('/sessions', { method: 'POST', body: JSON.stringify(data) }),

  join: (inviteCode: string) =>
    apiFetch<SessionWithRole>('/sessions/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    }),

  getMembers: (sessionId: string) =>
    apiFetch<SessionMember[]>(`/sessions/${sessionId}/members`),

  removeMember: (sessionId: string, userId: string) =>
    apiFetch<{ message: string }>(`/sessions/${sessionId}/members/${userId}`, {
      method: 'DELETE',
    }),

  updateSettings: (sessionId: string, playersCanEditStats: boolean) =>
    apiFetch<Session>(`/sessions/${sessionId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ playersCanEditStats }),
    }),
};

// ── Item endpoints ────────────────────────────────────────────────────────────
export interface CreateItemPayload {
  name: string;
  description: string;
  notes?: string;
  ownerCharacterId?: string | null;
  category?: 'COMBAT' | 'QUEST';
}

export interface UpdateItemPayload {
  name?: string;
  description?: string;
  notes?: string | null;
  ownerCharacterId?: string | null;
  category?: 'COMBAT' | 'QUEST';
}

export const itemsApi = {
  list: (sessionId: string, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiFetch<Item[]>(`/sessions/${sessionId}/items${qs}`);
  },

  create: (sessionId: string, data: CreateItemPayload) =>
    apiFetch<Item>(`/sessions/${sessionId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (sessionId: string, itemId: string, data: UpdateItemPayload) =>
    apiFetch<Item>(`/sessions/${sessionId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (sessionId: string, itemId: string) =>
    apiFetch<{ message: string }>(`/sessions/${sessionId}/items/${itemId}`, {
      method: 'DELETE',
    }),
};

// ── Character endpoints ───────────────────────────────────────────────────────
export interface CreateCharacterPayload {
  name: string;
  class: string;
  level?: number;
  /** Import-time: pre-populated stats (merged over defaults on the server) */
  stats?: { name: string; value: string }[];
  /** Import-time: free-text notes saved as NOTE traits */
  notes?: string[];
  /** Import-time: personality qualities saved as TRAIT entries */
  traits?: string[];
}

export interface UpdateCharacterPayload {
  name?: string;
  class?: string;
  level?: number;
}

export interface StatEntry {
  name: string;
  value: string;
}

export const charactersApi = {
  list: (sessionId: string) =>
    apiFetch<Character[]>(`/sessions/${sessionId}/characters`),

  get: (sessionId: string, charId: string) =>
    apiFetch<Character>(`/sessions/${sessionId}/characters/${charId}`),

  create: (sessionId: string, data: CreateCharacterPayload) =>
    apiFetch<Character>(`/sessions/${sessionId}/characters`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (sessionId: string, charId: string, data: UpdateCharacterPayload) =>
    apiFetch<Character>(`/sessions/${sessionId}/characters/${charId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (sessionId: string, charId: string) =>
    apiFetch<{ message: string }>(`/sessions/${sessionId}/characters/${charId}`, {
      method: 'DELETE',
    }),

  upsertStats: (sessionId: string, charId: string, stats: StatEntry[]) =>
    apiFetch<CharacterStat[]>(`/sessions/${sessionId}/characters/${charId}/stats`, {
      method: 'PUT',
      body: JSON.stringify({ stats }),
    }),
};

// ── Traits & Notes endpoints ──────────────────────────────────────────────────
export const traitsApi = {
  list: (sessionId: string, charId: string) =>
    apiFetch<CharacterTrait[]>(`/sessions/${sessionId}/characters/${charId}/traits`),

  create: (sessionId: string, charId: string, data: { type: 'TRAIT' | 'NOTE'; text: string }) =>
    apiFetch<CharacterTrait>(`/sessions/${sessionId}/characters/${charId}/traits`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (sessionId: string, charId: string, traitId: string, text: string) =>
    apiFetch<CharacterTrait>(`/sessions/${sessionId}/characters/${charId}/traits/${traitId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),

  delete: (sessionId: string, charId: string, traitId: string) =>
    apiFetch<{ message: string }>(`/sessions/${sessionId}/characters/${charId}/traits/${traitId}`, {
      method: 'DELETE',
    }),
};

export { apiFetch };

export const skillsApi = {
  list: (sessionId: string, charId: string) =>
    apiFetch<CharacterSkill[]>(`/sessions/${sessionId}/characters/${charId}/skills`),
  create: (sessionId: string, charId: string, data: SkillInput) =>
    apiFetch<CharacterSkill>(`/sessions/${sessionId}/characters/${charId}/skills`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (sessionId: string, charId: string, id: string, data: Partial<SkillInput>) =>
    apiFetch<CharacterSkill>(`/sessions/${sessionId}/characters/${charId}/skills/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (sessionId: string, charId: string, id: string) =>
    apiFetch<{ message: string }>(`/sessions/${sessionId}/characters/${charId}/skills/${id}`, {
      method: 'DELETE',
    }),
};

export const creaturesApi = {
  list: (sessionId: string) => apiFetch<SessionCreature[]>(`/sessions/${sessionId}/creatures`),
  create: (sessionId: string, data: SessionCreatureInput) =>
    apiFetch<SessionCreature>(`/sessions/${sessionId}/creatures`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (sessionId: string, id: string, data: Partial<SessionCreatureInput>) =>
    apiFetch<SessionCreature>(`/sessions/${sessionId}/creatures/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (sessionId: string, id: string) =>
    apiFetch<{ message: string }>(`/sessions/${sessionId}/creatures/${id}`, { method: 'DELETE' }),
};

export const combatApi = {
  get: (sessionId: string) => apiFetch<SessionCombatState | null>(`/sessions/${sessionId}/combat`),
  save: (sessionId: string, data: SessionCombatInput) =>
    apiFetch<SessionCombatState>(`/sessions/${sessionId}/combat`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

export const logbookApi = {
  list: (sessionId: string) => apiFetch<LogbookEntry[]>(`/sessions/${sessionId}/logbook`),
  create: (sessionId: string, data: LogbookEntryInput) =>
    apiFetch<LogbookEntry>(`/sessions/${sessionId}/logbook`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  update: (sessionId: string, id: string, data: LogbookEntryInput) =>
    apiFetch<LogbookEntry>(`/sessions/${sessionId}/logbook/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  delete: (sessionId: string, id: string) =>
    apiFetch<{ message: string }>(`/sessions/${sessionId}/logbook/${id}`, { method: 'DELETE' }),
};
