// ─── User ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string;
}

// ─── Session ─────────────────────────────────────────────────────────────────
export type Role = 'DM' | 'PLAYER';

export interface Session {
  id: string;
  name: string;
  description: string | null;
  dmId: string;
  inviteCode: string;
  playersCanEditStats: boolean;
  createdAt: string;
}

export interface SessionMember {
  sessionId: string;
  userId: string;
  role: Role;
  user: Pick<User, 'id' | 'displayName' | 'email'>;
}

// ─── Item ─────────────────────────────────────────────────────────────────────
export interface Item {
  id: string;
  sessionId: string;
  name: string;
  description: string;
  notes: string | null;
  category: 'COMBAT' | 'QUEST';
  ownerCharacterId: string | null;
  createdAt: string;
}

// ─── Character ────────────────────────────────────────────────────────────────
export interface CharacterStat {
  id: string;
  characterId: string;
  name: string;
  value: string;
}

export type TraitType = 'TRAIT' | 'NOTE';

export interface CharacterTrait {
  id: string;
  characterId: string;
  type: TraitType;
  text: string;
}

export interface Character {
  id: string;
  sessionId: string;
  ownerId: string;
  name: string;
  class: string;
  level: number;
  stats: CharacterStat[];
  traits: CharacterTrait[];
}

// ─── API response wrappers ───────────────────────────────────────────────────
export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
  details?: unknown;
}


export type SkillActionType = 'ACTION' | 'BONUS_ACTION' | 'REACTION' | 'FREE' | 'OTHER';

export interface CharacterSkill {
  id: string;
  characterId: string;
  name: string;            // "Kırmızı"
  subtitle: string | null; // "yapışkan boya"
  description: string;
  skillType: string | null; // "projectile", "melee"...
  range: string | null;     // "30 feet"
  actionType: SkillActionType;
  usesMax: number;          // 0 = sınırsız
  usesCurrent: number;
  sortOrder: number;
}

export type SkillInput = Omit<CharacterSkill, 'id' | 'characterId' | 'sortOrder'>;

export type SessionCreatureKind = 'NPC' | 'MONSTER';

export interface SessionCreature {
  id: string;
  kind: SessionCreatureKind;
  name: string;
  summary: string;
  hp: number | null;
  maxHp: number | null;
  armorClass: number | null;
  initiative: number | null;
  isVisibleToPlayers: boolean;
  sessionId: string;
  createdAt: string;
}

export type SessionCreatureInput = Omit<SessionCreature, 'id' | 'sessionId' | 'createdAt'>;

export type CombatantKind = 'CHARACTER' | 'NPC' | 'MONSTER' | 'CUSTOM';

export interface Combatant {
  id: string;
  sourceId: string | null;
  kind: CombatantKind;
  name: string;
  initiative: number;
}

export interface SessionCombatState {
  sessionId: string;
  round: number;
  activeEntryId: string | null;
  isActive: boolean;
  entries: Combatant[];
  updatedAt: string;
}

export type SessionCombatInput = Pick<SessionCombatState, 'round' | 'activeEntryId' | 'isActive' | 'entries'>;

export interface LogbookEntry {
  id: string;
  sessionId: string;
  title: string;
  summary: string;
  currentStatus: string;
  sessionDate: string;
  createdAt: string;
  updatedAt: string;
}

export type LogbookEntryInput = Pick<LogbookEntry, 'title' | 'summary' | 'currentStatus' | 'sessionDate'>;
