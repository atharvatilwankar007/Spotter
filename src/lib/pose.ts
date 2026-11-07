// Ghost Set engine: on-device pose tracking (MediaPipe), joint angles, rep counting, set analysis.
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Exercise } from './types';

/* MediaPipe landmark ids we keep: head, shoulders, elbows, wrists, hips, knees, ankles */
export const KP = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
// indices into KP
const H = 0, LS = 1, RS = 2, LE = 3, RE = 4, LW = 5, RW = 6, LH = 7, RH = 8, LK = 9, RK = 10, LA = 11, RA = 12;
export const BONES: [number, number][] = [
  [LS, RS], [LS, LE], [LE, LW], [RS, RE], [RE, RW], [LS, LH], [RS, RH], [LH, RH], [LH, LK], [LK, LA], [RH, RK], [RK, RA],
];
export const HEAD = H;

export interface Frame {
  t: number; // seconds since recording start
  p: number[]; // 13 × (x, y) normalised image coords
  w: number[]; // 13 × (x, y, z) world coords in metres, hip-centred
  vis: number[]; // 13 visibilities 0..1
}

export interface RepStat {
  t0: number;
  t1: number;
  rom: number; // range of motion in signal units (degrees, or % torso for "rise")
  dur: number; // seconds
}

export interface Recording {
  id: string;
  exId: string;
  sessionId: string;
  at: number;
  weight: number;
  signal: Signal;
  reps: RepStat[];
  frames: Frame[];
}

/* ---------- loading the model (once) ---------- */

let loading: Promise<PoseLandmarker> | null = null;
export function loadPose(): Promise<PoseLandmarker> {
  loading ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(new URL('./mediapipe', location.href).href.replace(/\/$/, ''));
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/pose_landmarker_lite.task', location.href).href, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return await make('GPU');
    } catch {
      return await make('CPU');
    }
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/* ---------- geometry ---------- */

type V3 = [number, number, number];
const w3 = (f: Frame, i: number): V3 => [f.w[i * 3], f.w[i * 3 + 1], f.w[i * 3 + 2]];
function angle(a: V3, b: V3, c: V3) {
  const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const d = Math.hypot(...u) * Math.hypot(...v);
  if (!d) return null;
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / d;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export type Signal = 'elbow' | 'knee' | 'hip' | 'shoulder' | 'rise';
export const SIGNAL_LABEL: Record<Signal, string> = {
  elbow: 'elbow angle',
  knee: 'knee angle',
  hip: 'hip hinge',
  shoulder: 'arm raise',
  rise: 'body height',
};
const SIGNALS: Signal[] = ['elbow', 'knee', 'hip', 'shoulder', 'rise'];
const MIN_ROM: Record<Signal, number> = { elbow: 28, knee: 28, hip: 22, shoulder: 25, rise: 12 };

/** joint angle, using whichever side the camera sees better (or both, averaged) */
function sided(f: Frame, l: [number, number, number], r: [number, number, number]) {
  const visL = Math.min(...l.map((i) => f.vis[i]));
  const visR = Math.min(...r.map((i) => f.vis[i]));
  const aL = visL > 0.35 ? angle(w3(f, l[0]), w3(f, l[1]), w3(f, l[2])) : null;
  const aR = visR > 0.35 ? angle(w3(f, r[0]), w3(f, r[1]), w3(f, r[2])) : null;
  if (aL != null && aR != null) return Math.abs(visL - visR) < 0.25 ? (aL + aR) / 2 : visL > visR ? aL : aR;
  return aL ?? aR;
}

export function signals(f: Frame): Record<Signal, number | null> {
  // "rise": hip height above ankles, as % of torso length, from image coords (y grows downward)
  const torso = Math.hypot(
    (f.p[LS * 2] + f.p[RS * 2]) / 2 - (f.p[LH * 2] + f.p[RH * 2]) / 2,
    (f.p[LS * 2 + 1] + f.p[RS * 2 + 1]) / 2 - (f.p[LH * 2 + 1] + f.p[RH * 2 + 1]) / 2,
  );
  const hipY = (f.p[LH * 2 + 1] + f.p[RH * 2 + 1]) / 2;
  const shY = (f.p[LS * 2 + 1] + f.p[RS * 2 + 1]) / 2;
  return {
    elbow: sided(f, [LS, LE, LW], [RS, RE, RW]),
    knee: sided(f, [LH, LK, LA], [RH, RK, RA]),
    hip: sided(f, [LS, LH, LK], [RS, RH, RK]),
    shoulder: sided(f, [LH, LS, LE], [RH, RS, RE]),
    rise: torso > 0.02 ? ((1 - (hipY + shY) / 2) / torso) * 100 : null,
  };
}

/** best guess of which joint matters for an exercise; the counter can still switch if another moves more */
export function priorSignal(ex: Exercise): Signal {
  const n = ex.name.toLowerCase();
  if (/calf/.test(n)) return 'rise';
  if (/crunch|sit-?up|leg raise|knee raise|v-up|captain|hip thrust|glute bridge|pull-through|swing|back ext|good morning|hyperext/.test(n)) return 'hip';
  if (/shrug|plank|hold|hang|carry|twist|pallof|bug|chop|side bend|copenhagen/.test(n)) return 'hip';
  if (/raise|fly|flye|face pull|pullover|straight-arm|y-raise/.test(n)) return 'shoulder';
  if (/rdl|romanian|deadlift|rack pull|hinge|glute|abduction|adduction/.test(n)) return 'hip';
  if (/squat|lunge|leg press|leg ext|leg curl|hamstring curl|split/.test(n)) return 'knee';
  if (/pull-?up|chin/.test(n)) return 'elbow';
  switch (ex.muscle) {
    case 'Quads':
    case 'Hamstrings':
      return 'knee';
    case 'Glutes':
    case 'Core':
    case 'Adductors':
      return 'hip';
    case 'Calves':
      return 'rise';
    default:
      return 'elbow';
  }
}

export function frameFromResult(
  lm: { x: number; y: number; visibility?: number }[],
  wl: { x: number; y: number; z: number }[],
  t: number,
): Frame {
  const q = (v: number) => Math.round(v * 1000) / 1000;
  const p: number[] = [];
  const w: number[] = [];
  const vis: number[] = [];
  for (const i of KP) {
    p.push(q(lm[i].x), q(lm[i].y));
    w.push(q(wl[i].x), q(wl[i].y), q(wl[i].z));
    vis.push(Math.round((lm[i].visibility ?? 1) * 100) / 100);
  }
  return { t: Math.round(t * 1000) / 1000, p, w, vis };
}

/** is the whole body (or at least the joints we need) in frame? */
export function bodyInFrame(f: Frame, sig: Signal) {
  const need =
    sig === 'elbow' || sig === 'shoulder' ? [LS, RS, LE, RE, LW, RW, LH, RH] : sig === 'rise' ? [LS, RS, LH, RH] : [LS, RS, LH, RH, LK, RK, LA, RA];
  return need.filter((i) => f.vis[i] > 0.5).length >= need.length / 2 + 1;
}

/* ---------- rep counter ---------- */

/** Which end of the movement you start (and rest) at. Most lifts start with the joint open/extended. */
export function restsHigh(ex: Exercise, sig: Signal): boolean {
  const n = ex.name.toLowerCase();
  if (sig === 'shoulder') return /pullover|straight-arm/.test(n); // raises start with arms down, pullovers start overhead
  if (sig === 'hip' && /hip thrust|glute bridge|leg raise|knee raise|captain|v-up/.test(n)) return /leg raise|knee raise|captain|v-up/.test(n); // thrusts start bent; leg raises start straight
  if (sig === 'rise') return !/calf|pull-?up|chin|jump/.test(n); // squats start tall, calf raises start low
  if (sig === 'elbow' && /pushdown|push-down|kickback|skull|triceps ext|tricep ext|overhead ext/.test(n)) return /overhead|skull/.test(n);
  if (sig === 'knee' && /leg ext|extension/.test(n)) return false; // starts bent
  return true;
}

const WINDOW = 10; // seconds of history used to learn your range of motion

export class RepCounter {
  signal: Signal;
  reps: RepStat[] = [];
  lastMoveT = 0;
  firstRepStart: number | null = null;
  value: number | null = null;
  progress = 0;
  private ema: Partial<Record<Signal, number>> = {};
  private hist: { t: number; v: Record<Signal, number | null> }[] = [];
  private phase: 'rest' | 'out' = 'rest';
  private leaveT = 0;
  private repMin = Infinity;
  private repMax = -Infinity;
  private restHigh: (s: Signal) => boolean;

  constructor(prior: Signal, restHigh: (s: Signal) => boolean = () => true) {
    this.signal = prior;
    this.restHigh = restHigh;
  }

  private range(s: Signal, since = 0) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of this.hist) {
      const v = h.v[s];
      if (v == null || h.t < since) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return { lo, hi, span: hi - lo };
  }

  /** returns a RepStat when a rep completes */
  push(t: number, raw: Record<Signal, number | null>): RepStat | null {
    for (const s of SIGNALS) {
      const v = raw[s];
      if (v == null) continue;
      const e = this.ema[s];
      this.ema[s] = e == null ? v : e + (v - e) * 0.5;
    }
    this.hist.push({ t, v: { ...(this.ema as Record<Signal, number | null>) } });
    while (this.hist.length && t - this.hist[0].t > WINDOW) this.hist.shift();

    // before the first rep, switch to whichever joint is clearly moving the most
    if (!this.reps.length && this.phase === 'rest' && t > 1.2) {
      const score = (s: Signal) => this.range(s, t - 5).span / MIN_ROM[s];
      const cur = score(this.signal);
      let best = this.signal;
      // only abandon the expected joint if it is barely moving while another clearly is
      if (cur < 1) for (const s of SIGNALS) if (score(s) > 2.2 && score(s) > score(best)) best = s;
      this.signal = best;
    }

    const v = this.ema[this.signal];
    this.value = v ?? null;
    if (v == null) return null;

    const back = this.hist.length > 3 ? this.hist[this.hist.length - 4].v[this.signal] : null;
    if (back != null && Math.abs(v - back) > MIN_ROM[this.signal] * 0.1) this.lastMoveT = t;

    const { lo, span } = this.range(this.signal);
    if (span < MIN_ROM[this.signal]) {
      this.progress = 0;
      this.leaveT = t;
      return null;
    }
    // r = 1 at the start/rest position, 0 at the far end of the rep
    const q = (v - lo) / span;
    const r = this.restHigh(this.signal) ? q : 1 - q;
    this.progress = Math.max(0, Math.min(1, 1 - r));

    if (this.phase === 'rest') {
      if (r > 0.82) {
        this.leaveT = t;
        this.repMin = v;
        this.repMax = v;
      }
      if (r < 0.38) {
        this.phase = 'out';
        this.firstRepStart ??= this.leaveT;
      }
    }
    this.repMin = Math.min(this.repMin, v);
    this.repMax = Math.max(this.repMax, v);
    if (this.phase === 'out' && r > 0.7) {
      this.phase = 'rest';
      const rep: RepStat = { t0: this.leaveT, t1: t, rom: this.repMax - this.repMin, dur: t - this.leaveT };
      this.reps.push(rep);
      this.leaveT = t;
      this.repMin = v;
      this.repMax = v;
      return rep;
    }
    return null;
  }
}

/* ---------- set analysis ---------- */

export type Grade = 'full' | 'short' | 'cut';
export const GRADE_LABEL: Record<Grade, string> = { full: 'Full range', short: 'A bit short', cut: 'Cut short' };

export interface Analysis {
  reps: number;
  romAvg: number;
  romDrop: number; // last reps vs first reps, fraction
  grades: Grade[]; // each rep's range vs your best rep in this set
  best: number; // index of the deepest rep
  worst: number; // index of the shallowest rep
  slowest: { rep: number; slow: number } | null; // slow = fraction slower than fastest early rep
  speed: number[]; // each rep's speed relative to the fastest (1 = fastest)
  rir: string;
  vsGhost: { depth: number; weight: number; reps: number } | null;
  verdict: string; // the story of this set
  vsLine: string | null; // compared with last time
  tip: string | null;
}

export function analyse(rec: { reps: RepStat[]; weight: number; signal: Signal }, ghost: Recording | null): Analysis {
  const r = rec.reps;
  const n = r.length;
  const romAvg = n ? r.reduce((a, x) => a + x.rom, 0) / n : 0;
  const head = r.slice(0, Math.min(2, n));
  const tail = r.slice(-Math.min(2, n));
  const romDrop = n >= 4 ? 1 - tail.reduce((a, x) => a + x.rom, 0) / tail.length / (head.reduce((a, x) => a + x.rom, 0) / head.length) : 0;

  // grade every rep against the best rep of this set
  const maxRom = Math.max(0, ...r.map((x) => x.rom));
  const grades: Grade[] = r.map((x) => (x.rom >= maxRom * 0.9 ? 'full' : x.rom >= maxRom * 0.78 ? 'short' : 'cut'));
  let best = 0;
  let worst = 0;
  r.forEach((x, i) => {
    if (x.rom > r[best].rom) best = i;
    if (x.rom < r[worst].rom) worst = i;
  });

  let slowest: Analysis['slowest'] = null;
  let loss = 0;
  const fastestDur = n ? Math.min(...r.slice(0, Math.min(3, n)).map((x) => x.dur)) : 1;
  const speed = r.map((x) => Math.min(1, fastestDur / x.dur));
  if (n >= 3) {
    r.forEach((x, i) => {
      const sl = x.dur / fastestDur - 1;
      if (!slowest || sl > slowest.slow) slowest = { rep: i + 1, slow: sl };
    });
    loss = r[n - 1].dur / fastestDur - 1;
  }
  const rir = n < 3 ? 'need 3+ reps to judge' : loss < 0.15 ? '3+ reps left' : loss < 0.3 ? '~2 reps left' : loss < 0.5 ? '~1 rep left' : 'at or near failure';

  // the story: where range held, where it dropped, how the last rep moved
  const parts: string[] = [];
  const fullCount = grades.filter((g) => g === 'full').length;
  const firstDrop = grades.findIndex((g) => g !== 'full');
  if (!n) parts.push('No reps detected');
  else if (fullCount === n) parts.push(n === 1 ? '1 full rep' : `All ${n} reps full range`);
  else if (firstDrop > 0 && grades.slice(firstDrop).every((g) => g !== 'full'))
    parts.push(`${firstDrop === 1 ? 'Rep 1' : `Reps 1–${firstDrop}`} solid`, `range dropped from rep ${firstDrop + 1}`);
  else parts.push(`${fullCount} of ${n} reps full range`);
  if (n >= 3 && loss > 0.4) parts.push('last rep ground out');
  else if (slowest && (slowest as { slow: number }).slow > 0.25) {
    const sl = slowest as { rep: number; slow: number };
    parts.push(`rep ${sl.rep} slowed ${Math.round(sl.slow * 100)}%`);
  }
  const verdict = parts.join(' · ');

  let vsGhost: Analysis['vsGhost'] = null;
  let vsLine: string | null = null;
  if (ghost && ghost.reps.length && ghost.signal === rec.signal) {
    const gRom = ghost.reps.reduce((a, x) => a + x.rom, 0) / ghost.reps.length;
    vsGhost = { depth: gRom ? romAvg / gRom - 1 : 0, weight: rec.weight - ghost.weight, reps: n - ghost.reps.length };
    const v: string[] = [];
    v.push(vsGhost.weight === 0 ? 'Same weight' : `${vsGhost.weight > 0 ? '+' : '−'}${Math.abs(vsGhost.weight)} kg`);
    const d = Math.round(vsGhost.depth * 100);
    v.push(Math.abs(d) < 3 ? 'same range' : d > 0 ? `${d}% more range` : `${-d}% less range`);
    if (vsGhost.reps) v.push(`${vsGhost.reps > 0 ? '+' : '−'}${Math.abs(vsGhost.reps)} rep${Math.abs(vsGhost.reps) === 1 ? '' : 's'}`);
    vsLine = `vs last time: ${v.join(' · ')}`;
  }

  let tip: string | null = null;
  if (romDrop > 0.12) tip = `Your range shrank ${Math.round(romDrop * 100)}% on the last reps — fatigue cutting reps short. Count only the full ones, or drop a little weight.`;
  else if (vsGhost && vsGhost.depth < -0.08) tip = 'Less range than last time. If the weight went up, that may be why — earn it with full reps first.';
  else if (n >= 3 && loss < 0.1) tip = 'Speed barely dropped. You likely had more in the tank — try one more rep or the next weight up.';
  return { reps: n, romAvg, romDrop, grades, best, worst, slowest, speed, rir, vsGhost, verdict, vsLine, tip };
}

/** the three joints that make the angle for each signal, as KP indices [left side, right side] */
export const JOINT_TRIPLES: Record<Signal, [[number, number, number], [number, number, number]] | null> = {
  elbow: [[LS, LE, LW], [RS, RE, RW]],
  knee: [[LH, LK, LA], [RH, RK, RA]],
  hip: [[LS, LH, LK], [RS, RH, RK]],
  shoulder: [[LH, LS, LE], [RH, RS, RE]],
  rise: null,
};

/** the side the camera sees better, for drawing an angle */
export function visibleTriple(f: Frame, sig: Signal): [number, number, number] | null {
  const t = JOINT_TRIPLES[sig];
  if (!t) return null;
  const v = (tr: [number, number, number]) => Math.min(...tr.map((i) => f.vis[i]));
  return v(t[0]) >= v(t[1]) ? t[0] : t[1];
}
