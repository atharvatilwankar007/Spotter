import { useSyncExternalStore } from 'react';
import { defaultState } from './defaults';
import type { Active, Day, Exercise, Session, SetLog, State } from './types';

const KEY = 'spotter.v1';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s && s.v === 1) return { ...defaultState(), ...s };
    }
  } catch {
    /* fall through to defaults */
  }
  return defaultState();
}

let state: State = load();
const subs = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep in memory */
  }
  subs.forEach((f) => f());
}

export function getState() {
  return state;
}

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => pick(state),
  );
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------- session ---------- */

export function startSession(dayId: string) {
  const day = state.days.find((d) => d.id === dayId);
  if (!day) return;
  const session: Session = { id: uid(), dayId, start: Date.now(), sets: [] };
  const active: Active = {
    sessionId: session.id,
    order: [...day.exerciseIds],
    exIdx: 0,
    phase: 'log',
    restEndsAt: 0,
    restTotal: 0,
  };
  set({ ...state, sessions: [...state.sessions, session], active });
}

function patchSession(id: string, f: (s: Session) => Session) {
  set({ ...state, sessions: state.sessions.map((s) => (s.id === id ? f(s) : s)) });
}

function patchActive(p: Partial<Active>) {
  if (!state.active) return;
  set({ ...state, active: { ...state.active, ...p } });
}

export function logSet(log: Omit<SetLog, 't'>) {
  const a = state.active;
  if (!a) return;
  patchSession(a.sessionId, (s) => ({ ...s, sets: [...s.sets, { ...log, t: Date.now() }] }));
}

export function undoLastSet() {
  const a = state.active;
  if (!a) return;
  patchSession(a.sessionId, (s) => ({ ...s, sets: s.sets.slice(0, -1) }));
  patchActive({ phase: 'log', restEndsAt: 0 });
}

export function startRest(seconds: number) {
  patchActive({ phase: 'rest', restEndsAt: Date.now() + seconds * 1000, restTotal: seconds });
}

export function adjustRest(delta: number) {
  const a = state.active;
  if (!a || a.phase !== 'rest') return;
  const restEndsAt = Math.max(Date.now() + 1000, a.restEndsAt + delta * 1000);
  patchActive({ restEndsAt, restTotal: Math.max(a.restTotal + delta, 1) });
}

export function endRest() {
  patchActive({ phase: 'log', restEndsAt: 0 });
}

export function goToExercise(exIdx: number) {
  patchActive({ exIdx, phase: 'log', restEndsAt: 0 });
}

export function addExerciseToSession(exId: string) {
  const a = state.active;
  if (!a) return;
  const order = [...a.order.filter((id) => id !== exId)];
  order.splice(a.exIdx + 1, 0, exId);
  patchActive({ order, exIdx: a.exIdx + 1, phase: 'log', restEndsAt: 0 });
}

export function finishSession(): string | null {
  const a = state.active;
  if (!a) return null;
  const id = a.sessionId;
  const sessions = state.sessions
    .map((s) => (s.id === id ? { ...s, end: Date.now() } : s))
    .filter((s) => s.id !== id || s.sets.length > 0);
  set({ ...state, sessions, active: null });
  return sessions.some((s) => s.id === id) ? id : null;
}

export function discardSession() {
  const a = state.active;
  if (!a) return;
  set({ ...state, sessions: state.sessions.filter((s) => s.id !== a.sessionId), active: null });
}

export function deleteSession(id: string) {
  set({ ...state, sessions: state.sessions.filter((s) => s.id !== id) });
}

/* ---------- program ---------- */

export function saveExercise(ex: Exercise) {
  set({ ...state, exercises: { ...state.exercises, [ex.id]: ex } });
}

export function saveDay(day: Day) {
  const exists = state.days.some((d) => d.id === day.id);
  set({ ...state, days: exists ? state.days.map((d) => (d.id === day.id ? day : d)) : [...state.days, day] });
}

export function deleteDay(id: string) {
  set({ ...state, days: state.days.filter((d) => d.id !== id) });
}

export function moveDay(id: string, dir: -1 | 1) {
  const days = [...state.days];
  const i = days.findIndex((d) => d.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= days.length) return;
  [days[i], days[j]] = [days[j], days[i]];
  set({ ...state, days });
}

export function setSettings(p: Partial<State['settings']>) {
  set({ ...state, settings: { ...state.settings, ...p } });
}

/* ---------- backup ---------- */

export function exportJSON() {
  return JSON.stringify({ ...state, active: null, exportedAt: new Date().toISOString() }, null, 1);
}

export function importJSON(text: string) {
  const s = JSON.parse(text) as State;
  if (!s || s.v !== 1 || !Array.isArray(s.sessions) || !s.exercises) throw new Error('Not a Spotter backup');
  set({ ...defaultState(), ...s, active: null });
}
