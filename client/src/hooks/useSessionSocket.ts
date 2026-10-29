/**
 * useSessionSocket.ts
 *
 * Custom hook that connects to Socket.IO, joins the given session room,
 * and invalidates TanStack Query caches when the server emits realtime events.
 *
 * Usage:
 *   useSessionSocket(sessionId);  // call once inside SessionPage / ItemsPage / CharactersPage
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';

const SOCKET_EVENTS = {
  ITEM_CREATED: 'item:created',
  ITEM_UPDATED: 'item:updated',
  ITEM_DELETED: 'item:deleted',
  STAT_UPDATED: 'stat:updated',
  TRAIT_CREATED: 'trait:created',
  TRAIT_UPDATED: 'trait:updated',
  TRAIT_DELETED: 'trait:deleted',
  CHARACTER_CREATED: 'character:created',
  CHARACTER_DELETED: 'character:deleted',
  COMBAT_UPDATED: 'combat:updated',
  LOGBOOK_UPDATED: 'logbook:updated',
} as const;

// Socket connects to the backend server directly.
// In dev Vite proxies /api but NOT Socket.IO; use port 3001 explicitly.
// In prod the same host serves both via Nginx.
const SOCKET_URL =
  typeof window !== 'undefined' && window.location.port === '5173'
    ? 'http://localhost:3001'  // dev
    : window.location.origin;  // prod

// Singleton socket — created once and reused across re-renders
let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { withCredentials: true });
  }
  return socket;
}

export function useSessionSocket(sessionId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    const s = getSocket();

    // Join session room
    s.emit('join-session', sessionId);

    // ── Items ──────────────────────────────────────────────────────────────────
    const onItemCreated = () => {
      queryClient.invalidateQueries({ queryKey: ['items', sessionId] });
    };
    const onItemUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['items', sessionId] });
    };
    const onItemDeleted = () => {
      queryClient.invalidateQueries({ queryKey: ['items', sessionId] });
    };

    // ── Characters ─────────────────────────────────────────────────────────────
    const onCharacterCreated = () => {
      queryClient.invalidateQueries({ queryKey: ['characters', sessionId] });
    };
    const onCharacterDeleted = () => {
      queryClient.invalidateQueries({ queryKey: ['characters', sessionId] });
    };

    // ── Stats ──────────────────────────────────────────────────────────────────
    const onStatUpdated = (data: { characterId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['character', sessionId, data.characterId] });
      queryClient.invalidateQueries({ queryKey: ['characters', sessionId] });
    };

    // ── Traits ─────────────────────────────────────────────────────────────────
    const onTraitChanged = (data: { characterId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['traits', sessionId, data.characterId] });
    };
    const onCombatUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['combat', sessionId] });
    };
    const onLogbookUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['logbook', sessionId] });
    };

    s.on(SOCKET_EVENTS.ITEM_CREATED, onItemCreated);
    s.on(SOCKET_EVENTS.ITEM_UPDATED, onItemUpdated);
    s.on(SOCKET_EVENTS.ITEM_DELETED, onItemDeleted);
    s.on(SOCKET_EVENTS.CHARACTER_CREATED, onCharacterCreated);
    s.on(SOCKET_EVENTS.CHARACTER_DELETED, onCharacterDeleted);
    s.on(SOCKET_EVENTS.STAT_UPDATED, onStatUpdated);
    s.on(SOCKET_EVENTS.TRAIT_CREATED, onTraitChanged);
    s.on(SOCKET_EVENTS.TRAIT_UPDATED, onTraitChanged);
    s.on(SOCKET_EVENTS.TRAIT_DELETED, onTraitChanged);
    s.on(SOCKET_EVENTS.COMBAT_UPDATED, onCombatUpdated);
    s.on(SOCKET_EVENTS.LOGBOOK_UPDATED, onLogbookUpdated);

    return () => {
      s.emit('leave-session', sessionId);
      s.off(SOCKET_EVENTS.ITEM_CREATED, onItemCreated);
      s.off(SOCKET_EVENTS.ITEM_UPDATED, onItemUpdated);
      s.off(SOCKET_EVENTS.ITEM_DELETED, onItemDeleted);
      s.off(SOCKET_EVENTS.CHARACTER_CREATED, onCharacterCreated);
      s.off(SOCKET_EVENTS.CHARACTER_DELETED, onCharacterDeleted);
      s.off(SOCKET_EVENTS.STAT_UPDATED, onStatUpdated);
      s.off(SOCKET_EVENTS.TRAIT_CREATED, onTraitChanged);
      s.off(SOCKET_EVENTS.TRAIT_UPDATED, onTraitChanged);
      s.off(SOCKET_EVENTS.TRAIT_DELETED, onTraitChanged);
      s.off(SOCKET_EVENTS.COMBAT_UPDATED, onCombatUpdated);
      s.off(SOCKET_EVENTS.LOGBOOK_UPDATED, onLogbookUpdated);
    };
  }, [sessionId, queryClient]);
}
