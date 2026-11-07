import type { Exercise, Session, SetLog, State } from './types';

/** Epley estimated one-rep max */
export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

export const fmtW = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(w * 10 === Math.round(w * 10) ? 1 : 2));

const done = (s: State) => s.sessions.filter((x) => x.end);

/** Sets of an exercise in the most recent finished session (excluding one) that contained it */
export function lastSets(s: State, exId: string, excludeSessionId?: string): { sets: SetLog[]; at: number } | null {
  const list = done(s);
  for (let i = list.length - 1; i >= 0; i--) {
    const ses = list[i];
    if (ses.id === excludeSessionId) continue;
    const sets = ses.sets.filter((x) => x.exId === exId);
    if (sets.length) return { sets, at: ses.start };
  }
  return null;
}

export interface Target {
  w: number;
  r: number;
  why: string;
}

/** Double progression: hit the top of the range on every set → add weight, else add a rep */
export function target(ex: Exercise, last: SetLog[] | undefined): Target | null {
  if (!last?.length) return null;
  const topW = Math.max(...last.map((x) => x.w));
  const atTop = last.filter((x) => x.w === topW);
  const allMaxed = atTop.length >= Math.min(ex.sets, last.length) && atTop.every((x) => x.r >= ex.repMax);
  if (allMaxed) return { w: topW + ex.step, r: ex.repMin, why: `+${fmtW(ex.step)} kg` };
  const minReps = Math.min(...atTop.map((x) => x.r));
  return { w: topW, r: Math.min(minReps + 1, ex.repMax), why: '+1 rep' };
}

/** What to prefill for the next set */
export function prefill(ex: Exercise, sessionSets: SetLog[], last: SetLog[] | undefined): { w: number; r: number } {
  const mine = sessionSets.filter((x) => x.exId === ex.id);
  if (mine.length) {
    const p = mine[mine.length - 1];
    return { w: p.w, r: p.r };
  }
  const t = target(ex, last);
  if (t) return { w: t.w, r: t.r };
  return { w: 20, r: ex.repMin };
}

export function bestE1rm(s: State, exId: string, beforeT = Infinity) {
  let best = 0;
  for (const ses of done(s)) for (const x of ses.sets) if (x.exId === exId && x.t < beforeT) best = Math.max(best, e1rm(x.w, x.r));
  return best;
}

/** One point per session: best e1RM that session */
export function series(s: State, exId: string) {
  const pts: { t: number; v: number; top: SetLog }[] = [];
  for (const ses of done(s)) {
    let top: SetLog | null = null;
    for (const x of ses.sets) if (x.exId === exId && (!top || e1rm(x.w, x.r) > e1rm(top.w, top.r))) top = x;
    if (top) pts.push({ t: ses.start, v: e1rm(top.w, top.r), top });
  }
  return pts;
}

export function volume(sets: SetLog[]) {
  return sets.reduce((a, x) => a + x.w * x.r, 0);
}

export function nextDayId(s: State): string | undefined {
  const list = done(s);
  if (!s.days.length) return undefined;
  const last = list[list.length - 1];
  if (!last) return s.days[0].id;
  const i = s.days.findIndex((d) => d.id === last.dayId);
  return s.days[(i + 1) % s.days.length].id;
}

export function lastDone(s: State, dayId: string): Session | undefined {
  const list = done(s).filter((x) => x.dayId === dayId);
  return list[list.length - 1];
}

export function estMinutes(s: State, exIds: string[]) {
  let sec = 0;
  for (const id of exIds) {
    const ex = s.exercises[id];
    if (ex) sec += ex.sets * (ex.rest + 45);
  }
  return Math.round(sec / 60 / 5) * 5;
}

/** PRs set in a session: sets whose e1RM beat every earlier set of that exercise */
export function sessionPRs(s: State, ses: Session) {
  const prs: SetLog[] = [];
  const byEx = new Map<string, SetLog>();
  for (const x of ses.sets) {
    const prevBest = bestE1rm(s, x.exId, ses.start);
    const cur = byEx.get(x.exId);
    if (prevBest > 0 && e1rm(x.w, x.r) > prevBest && (!cur || e1rm(x.w, x.r) > e1rm(cur.w, cur.r))) byEx.set(x.exId, x);
  }
  byEx.forEach((v) => prs.push(v));
  return prs;
}

export function ago(t: number) {
  const d = Math.floor((startOfDay(Date.now()) - startOfDay(t)) / 864e5);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return `${Math.round(d / 7)} weeks ago`;
}

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const mmss = (sec: number) => {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
