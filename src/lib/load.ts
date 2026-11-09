// How a weight is entered and shown: kg, lb, "bar + plates", or pin holes.
// Sets are always stored in kg (or a plain hole count), so switching units never changes your history.
import { fmtW } from './format';
import { getState } from './store';
import type { Exercise, LoadKind, SetLog, Unit } from './types';

const LB = 2.20462;

export const kindOf = (ex: Exercise): LoadKind => ex.load ?? 'weight';
export const unitOf = (ex: Exercise): Unit => ex.unit ?? getState().settings.unit ?? 'kg';

/** what the set stores in its `u` field (plain weight stores nothing) */
export const setMark = (ex: Exercise): SetLog['u'] => (kindOf(ex) === 'weight' ? undefined : (kindOf(ex) as 'bar' | 'holes'));

/** the number shown on screen for a stored value */
export function toShow(w: number, ex: Exercise) {
  if (kindOf(ex) === 'holes' || unitOf(ex) === 'kg') return w;
  return Math.round(w * LB * 10) / 10;
}

/** the stored value for a number typed on screen */
export function fromShow(v: number, ex: Exercise) {
  if (kindOf(ex) === 'holes' || unitOf(ex) === 'kg') return v;
  return Math.round((v / LB) * 1000) / 1000;
}

/** one tap of + / −, in stored units */
export const stepKg = (ex: Exercise) => (kindOf(ex) === 'holes' ? 1 : ex.step);

/** one tap of + / −, in screen units (2.5 kg becomes 5 lb) */
export function stepShow(ex: Exercise) {
  if (kindOf(ex) === 'holes') return 1;
  if (unitOf(ex) === 'kg') return ex.step;
  return Math.max(2.5, Math.round((ex.step * LB) / 2.5) * 2.5);
}

export const unitLabel = (ex: Exercise) => (kindOf(ex) === 'holes' ? 'holes' : unitOf(ex));

/** "50 kg", "Bar + 30 kg", "8 holes" */
export function loadText(w: number, ex: Exercise, u: SetLog['u'] = setMark(ex)) {
  if (u === 'holes') return `${fmtW(w)} ${w === 1 ? 'hole' : 'holes'}`;
  const text = `${fmtW(toShow(w, ex))} ${unitOf(ex)}`;
  return u === 'bar' ? `Bar + ${text}` : text;
}

/** compact form for chips: "50", "B+30", "8h" */
export function shortLoad(x: Pick<SetLog, 'w' | 'u'>, ex?: Exercise) {
  if (x.u === 'holes') return `${fmtW(x.w)}h`;
  const n = fmtW(ex ? toShow(x.w, ex) : x.w);
  return x.u === 'bar' ? `B+${n}` : n;
}

/** "+2.5 kg" / "+1 hole" */
export const addText = (ex: Exercise) => (kindOf(ex) === 'holes' ? '+1 hole' : `+${fmtW(stepShow(ex))} ${unitOf(ex)}`);

/** a difference in estimated strength, in this exercise's units */
export function diffText(d: number, ex: Exercise) {
  if (kindOf(ex) === 'holes') return Math.abs(d).toFixed(1);
  return `${fmtW(toShow(+Math.abs(d).toFixed(1), ex))} ${unitOf(ex)}`;
}
