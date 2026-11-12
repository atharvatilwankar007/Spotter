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
/** landmark positions within a Frame, by name */
export const J = { H, LS, RS, LE, RE, LW, RW, LH, RH, LK, RK, LA, RA } as const;

export interface Frame {
  t: number; // seconds since recording start
  p: number[]; // 13 × (x, y) normalised image coords
  w: number[]; // 13 × (x, y, z) world coords in metres, hip-centred
  vis: number[]; // 13 visibilities 0..1
}

export interface RepStat {
  t0: number;
  t1: number;
  rom: number; // range of motion in signal units (degrees, or % for "rise"/"spread")
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
  ar?: number; // camera aspect ratio (width / height)
  side?: Side;
}

/* ---------- loading the model (once) ---------- */

let loading: Promise<PoseLandmarker> | null = null;
export function loadPose(): Promise<PoseLandmarker> {
  loading ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(new URL('./mediapipe', location.href).href.replace(/\/$/, ''));
    // "full" is steadier on elbows and knees than "lite"; fall back if this phone can't run it
    const make = (model: string, delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL(`./models/${model}`, location.href).href, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    for (const [m, d] of [
      ['pose_landmarker_full.task', 'GPU'],
      ['pose_landmarker_lite.task', 'GPU'],
      ['pose_landmarker_lite.task', 'CPU'],
    ] as const) {
      try {
        return await make(m, d);
      } catch {
        /* try the next one */
      }
    }
    throw new Error('pose model failed to load');
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/* ---------- exercise profiles: which joint, where you start, how to place the phone ---------- */

export type Signal = 'elbow' | 'knee' | 'hip' | 'shoulder' | 'rise' | 'spread';
export type Side = 'L' | 'R' | 'both';
export type View = 'side' | 'front' | 'angle';

export const SIGNAL_LABEL: Record<Signal, string> = {
  elbow: 'elbow angle',
  knee: 'knee angle',
  hip: 'hip angle',
  shoulder: 'arm raise',
  rise: 'body height',
  spread: 'hand spread',
};

/** arms: shoulders, elbows, hands · legs: shoulders to feet · hinge: shoulders to knees · full: whole body */
export type Need = 'arms' | 'legs' | 'hinge' | 'full';
export const NEED_LABEL: Record<Need, string> = {
  arms: 'Shoulders, elbows and hands in frame',
  legs: 'Shoulders down to feet in frame',
  hinge: 'Shoulders down to knees in frame',
  full: 'Whole body in frame',
};
const needFor = (s: Signal): Need => (s === 'elbow' || s === 'shoulder' || s === 'spread' ? 'arms' : s === 'knee' ? 'legs' : s === 'hip' ? 'hinge' : 'full');

export interface Profile {
  track: boolean; // can the camera count this one at all?
  signal: Signal;
  restHigh: boolean; // do you start with the joint open (true) or closed (false)?
  rom: number; // a typical full rep's travel, in signal units
  view: View;
  beta?: boolean; // harder to see (lying, machines in the way)
  hint: string; // phone placement in plain words
  need: Need; // which body parts must be in frame
  /** extra geometric proof that the far end of a real rep was reached (y grows downward) */
  farCheck?: (f: Frame) => boolean;
}

const y = (f: Frame, i: number) => f.p[i * 2 + 1];
const seen = (f: Frame, i: number) => f.vis[i] > 0.4;
const torsoLen = (f: Frame) => Math.abs((y(f, LS) + y(f, RS)) / 2 - (y(f, LH) + y(f, RH)) / 2) || 0.2;
/** hands pressed above the shoulders */
const wristsOverhead = (f: Frame) => [[LW, LS], [RW, RS]].some(([w, s]) => seen(f, w) && y(f, w) < y(f, s) - torsoLen(f) * 0.15);
/** wrist curled up above the elbow */
const wristAboveElbow = (f: Frame) => [[LW, LE], [RW, RE]].some(([w, e]) => seen(f, w) && seen(f, e) && y(f, w) < y(f, e));
/** hands raised to about shoulder height */
const handsAtShoulder = (f: Frame) => [[LW, LS], [RW, RS]].some(([w, s]) => seen(f, w) && y(f, w) < y(f, s) + torsoLen(f) * 0.25);

const SIDE_HINT = 'Stand side-on to the phone, about 2–3 m away, phone at hip height.';
const FRONT_HINT = 'Face the phone, about 2–3 m away, phone at chest height.';
const ANGLE_HINT = 'Put the phone at a 45° angle, level with the bench, about 2 m away.';

type Rule = [RegExp, Omit<Profile, 'hint' | 'track' | 'need'> & { track?: boolean }];
const RULES: Rule[] = [
  [/plank|hold|hang|carry|bug|pallof|chop|twist|side bend|copenhagen|shrug|wrist curl|abduction|adduction/, { track: false, signal: 'hip', restHigh: true, rom: 0, view: 'side' }],
  [/calf/, { signal: 'rise', restHigh: false, rom: 10, view: 'side' }],
  [/leg raise|knee raise|captain|v-up/, { signal: 'hip', restHigh: true, rom: 60, view: 'side' }],
  [/crunch|sit-?up/, { signal: 'hip', restHigh: true, rom: 25, view: 'side' }],
  [/hip thrust|glute bridge/, { signal: 'hip', restHigh: false, rom: 45, view: 'side' }],
  [/rack pull/, { signal: 'hip', restHigh: false, rom: 35, view: 'side' }],
  // from the floor: you start bent over the bar
  [/^(?!.*(romanian|stiff|single-leg)).*deadlift/, { signal: 'hip', restHigh: false, rom: 70, view: 'side' }],
  [/rdl|romanian|deadlift|good morning|back ext|pull-through|swing|stiff/, { signal: 'hip', restHigh: true, rom: 55, view: 'side' }],
  [/leg ext/, { signal: 'knee', restHigh: false, rom: 60, view: 'side', beta: true }],
  [/lying leg curl/, { signal: 'knee', restHigh: true, rom: 60, view: 'side', beta: true }],
  [/leg curl|nordic|glute-ham/, { signal: 'knee', restHigh: true, rom: 60, view: 'side', beta: true }],
  [/squat|lunge|leg press|split|step-up|hack|pendulum|belt/, { signal: 'knee', restHigh: true, rom: 65, view: 'side' }],
  [/rear delt|reverse pec|face pull/, { signal: 'spread', restHigh: false, rom: 80, view: 'front' }],
  [/fly|pec deck|crossover/, { signal: 'spread', restHigh: true, rom: 90, view: 'front' }],
  [/pullover|straight-arm/, { signal: 'shoulder', restHigh: true, rom: 60, view: 'side' }],
  [/lateral|y-raise|upright row/, { signal: 'shoulder', restHigh: false, rom: 55, view: 'front', farCheck: handsAtShoulder }],
  [/front raise/, { signal: 'shoulder', restHigh: false, rom: 60, view: 'side' }],
  [/overhead press|shoulder press|military|push press|arnold|seated barbell press|landmine press|ohp/, { signal: 'elbow', restHigh: false, rom: 65, view: 'front', farCheck: wristsOverhead }],
  [/machine chest press|incline machine press|machine.*press/, { signal: 'elbow', restHigh: false, rom: 55, view: 'side', beta: true }],
  [/push-?up|dip/, { signal: 'elbow', restHigh: true, rom: 55, view: 'side' }],
  [/bench|incline|decline|press|jm press/, { signal: 'elbow', restHigh: true, rom: 55, view: 'angle', beta: true }],
  [/row|pulldown|pull-?up|chin|inverted/, { signal: 'elbow', restHigh: true, rom: 60, view: 'side' }],
  [/pushdown|push-down|kickback|machine triceps/, { signal: 'elbow', restHigh: false, rom: 55, view: 'side' }],
  [/skull|extension|ext\b/, { signal: 'elbow', restHigh: true, rom: 60, view: 'side' }],
  [/curl/, { signal: 'elbow', restHigh: true, rom: 85, view: 'side', farCheck: wristAboveElbow }],
];

export function profileFor(ex: Exercise): Profile {
  const n = ex.name.toLowerCase();
  // any shoulder press (standing, seated, dumbbell, machine…) starts at the shoulders and presses up
  if (ex.muscle === 'Shoulders' && /press/.test(n)) return { track: true, signal: 'elbow', restHigh: false, rom: 65, view: 'front', hint: FRONT_HINT, need: 'arms', farCheck: wristsOverhead };
  for (const [re, p] of RULES)
    if (re.test(n)) return { track: true, ...p, need: needFor(p.signal), hint: p.view === 'side' ? SIDE_HINT : p.view === 'front' ? FRONT_HINT : ANGLE_HINT };
  // custom exercises: best guess from the muscle
  const by: Partial<Record<Exercise['muscle'], Signal>> = { Quads: 'knee', Hamstrings: 'hip', Glutes: 'hip', Core: 'hip', Calves: 'rise' };
  const signal = by[ex.muscle] ?? 'elbow';
  return { track: true, signal, restHigh: signal !== 'rise', rom: signal === 'rise' ? 10 : 50, view: 'side', hint: SIDE_HINT, need: needFor(signal) };
}

/* ---------- geometry (2D, in the camera's image, corrected for aspect ratio) ---------- */

const TRIPLES: Record<'elbow' | 'knee' | 'hip' | 'shoulder', [[number, number, number], [number, number, number]]> = {
  elbow: [[LS, LE, LW], [RS, RE, RW]],
  knee: [[LH, LK, LA], [RH, RK, RA]],
  hip: [[LS, LH, LK], [RS, RH, RK]],
  shoulder: [[LH, LS, LE], [RH, RS, RE]],
};

export function angle2(f: Frame, ar: number, [a, b, c]: [number, number, number]) {
  const ux = (f.p[a * 2] - f.p[b * 2]) * ar;
  const uy = f.p[a * 2 + 1] - f.p[b * 2 + 1];
  const vx = (f.p[c * 2] - f.p[b * 2]) * ar;
  const vy = f.p[c * 2 + 1] - f.p[b * 2 + 1];
  const d = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (!d) return null;
  return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / d))) * 180) / Math.PI;
}

const minVis = (f: Frame, t: number[]) => Math.min(...t.map((i) => f.vis[i]));

/** which side of the body the camera sees better for a signal */
export function betterSide(f: Frame, sig: Signal): Side {
  if (sig === 'rise' || sig === 'spread') return 'both';
  const [l, r] = TRIPLES[sig];
  return minVis(f, l) >= minVis(f, r) ? 'L' : 'R';
}

/** the signal value for one frame, or null if the camera can't see it clearly */
export function readSignal(f: Frame, sig: Signal, ar: number, side: Side): number | null {
  if (sig === 'rise') {
    const hipY = (f.p[LH * 2 + 1] + f.p[RH * 2 + 1]) / 2;
    const shY = (f.p[LS * 2 + 1] + f.p[RS * 2 + 1]) / 2;
    const torso = Math.abs(hipY - shY);
    if (torso < 0.03 || minVis(f, [LS, RS, LH, RH]) < 0.4) return null;
    return ((1 - (hipY + shY) / 2) / torso) * 100;
  }
  if (sig === 'spread') {
    if (minVis(f, [LW, RW, LS, RS]) < 0.4) return null;
    const sw = Math.abs(f.p[LS * 2] - f.p[RS * 2]) * ar;
    if (sw < 0.02) return null;
    return (Math.abs(f.p[LW * 2] - f.p[RW * 2]) * ar * 100) / sw;
  }
  const [l, r] = TRIPLES[sig];
  const read = (t: [number, number, number]) => (minVis(f, t) >= 0.5 ? angle2(f, ar, t) : null);
  if (side === 'L') return read(l);
  if (side === 'R') return read(r);
  const a = read(l);
  const b = read(r);
  return a != null && b != null ? (a + b) / 2 : (a ?? b);
}

/** all signals, best side, for display (e.g. the angle drawn on a still) */
export function signals(f: Frame, ar = 4 / 3): Record<Signal, number | null> {
  const out = {} as Record<Signal, number | null>;
  for (const s of ['elbow', 'knee', 'hip', 'shoulder', 'rise', 'spread'] as Signal[]) out[s] = readSignal(f, s, ar, betterSide(f, s));
  return out;
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

/* ---------- setup check: is the phone placed right? ---------- */

export interface SetupCheck {
  visible: boolean; // the joints we need are in frame and clear
  distance: 'ok' | 'closer' | 'back';
  view: 'ok' | 'turn-side' | 'turn-front';
  facing: View; // what the camera currently sees
}

export function checkSetup(f: Frame, prof: Profile, ar: number): SetupCheck {
  const need =
    prof.need === 'arms'
      ? [LS, RS, LE, RE, LW, RW]
      : prof.need === 'hinge'
        ? [LS, RS, LH, RH, LK, RK]
        : prof.need === 'full'
          ? [LS, RS, LH, RH, LA, RA]
          : [LS, RS, LH, RH, LK, RK, LA, RA];
  // for side views one side may be hidden behind the body: need either side clearly
  const sideOk = (idx: number[]) => idx.filter((i) => f.vis[i] > 0.5 && f.p[i * 2] > 0.02 && f.p[i * 2] < 0.98 && f.p[i * 2 + 1] > 0.02 && f.p[i * 2 + 1] < 0.98).length;
  const left = need.filter((i) => [LS, LE, LW, LH, LK, LA].includes(i));
  const right = need.filter((i) => [RS, RE, RW, RH, RK, RA].includes(i));
  const visible = prof.view === 'front' ? sideOk(need) >= need.length - 1 : Math.max(sideOk(left), sideOk(right)) >= left.length - 1;

  // how big the body is in the frame (shoulder to hip, as a share of frame height)
  // hips may be out of frame for arm exercises: then judge size from the upper arm instead
  const hipsSeen = Math.max(f.vis[LH], f.vis[RH]) > 0.5 && Math.min(f.p[LH * 2 + 1], f.p[RH * 2 + 1]) < 1;
  const ua = Math.max(...[[LS, LE], [RS, RE]].map(([s, e]) => (f.vis[s] > 0.5 && f.vis[e] > 0.5 ? Math.hypot((f.p[s * 2] - f.p[e * 2]) * ar, f.p[s * 2 + 1] - f.p[e * 2 + 1]) : 0)));
  const torso = hipsSeen || !ua ? Math.abs((f.p[LS * 2 + 1] + f.p[RS * 2 + 1]) / 2 - (f.p[LH * 2 + 1] + f.p[RH * 2 + 1]) / 2) : ua * 1.6;
  // arm exercises are fine closer up: only the upper body has to fit
  const distance = torso > (prof.need === 'arms' ? 0.62 : 0.42) ? 'back' : torso < 0.09 ? 'closer' : 'ok';

  // facing: how wide the shoulders look vs how deep (world coords)
  const dx = f.w[RS * 3] - f.w[LS * 3];
  const dz = f.w[RS * 3 + 2] - f.w[LS * 3 + 2];
  const r = Math.abs(dx) / (Math.hypot(dx, dz) || 1);
  const facing: View = r > 0.78 ? 'front' : r < 0.5 ? 'side' : 'angle';
  const view =
    prof.view === 'side' ? (facing === 'front' ? 'turn-side' : 'ok') : prof.view === 'front' ? (facing === 'side' ? 'turn-front' : 'ok') : 'ok';
  return { visible, distance, view, facing };
}

/**
 * Mid-set check, much looser than the setup one: only true "you've left" situations fail it
 * (walked off, most tracked joints out of frame, way too near or far), so a normal rep never pauses the count.
 */
export function inPosition(f: Frame, prof: Profile): boolean {
  const left = prof.signal === 'elbow' || prof.signal === 'shoulder' || prof.signal === 'spread' ? [LS, LE, LH] : [LS, LH, LK];
  const right = prof.signal === 'elbow' || prof.signal === 'shoulder' || prof.signal === 'spread' ? [RS, RE, RH] : [RS, RH, RK];
  const seen = (i: number) => f.vis[i] > 0.3 && f.p[i * 2] > -0.03 && f.p[i * 2] < 1.03 && f.p[i * 2 + 1] > -0.03 && f.p[i * 2 + 1] < 1.03;
  const best = Math.max(left.filter(seen).length, right.filter(seen).length);
  const torso = Math.abs((f.p[LS * 2 + 1] + f.p[RS * 2 + 1]) / 2 - (f.p[LH * 2 + 1] + f.p[RH * 2 + 1]) / 2);
  const wide = Math.abs(f.p[LS * 2] - f.p[RS * 2]);
  const arm = Math.max(Math.hypot(f.p[LS * 2] - f.p[LE * 2], f.p[LS * 2 + 1] - f.p[LE * 2 + 1]), Math.hypot(f.p[RS * 2] - f.p[RE * 2], f.p[RS * 2 + 1] - f.p[RE * 2 + 1]));
  const size = Math.max(torso, wide, prof.need === 'arms' ? arm * 1.6 : 0); // a lying or bent-over body has a short torso but is still in frame
  return best >= 2 && size > 0.04 && size < (prof.need === 'arms' ? 0.95 : 0.7);
}

/* ---------- rep counter ---------- */

/** One-Euro filter: removes jitter when still, stays responsive when moving */
class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  private minCutoff: number;
  private beta: number;
  constructor(minCutoff = 1.4, beta = 0.02) {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }
  filter(v: number, t: number) {
    if (this.x == null) {
      this.x = v;
      this.t = t;
      return v;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const a = (fc: number) => 1 / (1 + 1 / (2 * Math.PI * fc * dt));
    const d = (v - this.x) / dt;
    this.dx += a(1) * (d - this.dx);
    const fc = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += a(fc) * (v - this.x);
    return this.x;
  }
}

/**
 * Counts reps from one joint signal.
 * - armed only once you hold the start position (no counting while you set up or walk in)
 * - a rep = leave the start, travel a real share of your range, come back
 * - must take a realistic time, so jitter can't count twice
 */
export class RepCounter {
  readonly signal: Signal;
  readonly side: Side;
  readonly ar: number;
  reps: RepStat[] = [];
  lastMoveT = 0;
  firstRepStart: number | null = null;
  value: number | null = null;
  progress = 0;
  depth = 0; // unclamped travel toward the far end of the rep
  captureFrom = Infinity; // depth worth photographing
  armed = false;
  armNow = false; // you said start: this exact position is the start, no need to hold still
  private f = new OneEuro();
  private raw: number[] = [];
  private farCheck?: (f: Frame) => boolean;
  private farOk = false;
  private dir: number; // +1 if the far end of the rep is a bigger value
  private base = 0; // the start position value
  private learned: number; // typical travel of your reps
  private minTravel: number;
  private phase: 'rest' | 'out' | 'back' = 'rest';
  private backPeak = 0;
  private reverseChecked = false;
  private leaveT = 0;
  private peak = 0;
  private lastRepT = -9;
  private holdSince = 0;
  private holdVal = 0;
  private prevV: number | null = null;
  private prevT = 0;

  constructor(prof: Profile, side: Side, ar: number) {
    this.signal = prof.signal;
    this.side = side;
    this.ar = ar;
    this.dir = prof.restHigh ? -1 : 1;
    this.farCheck = prof.farCheck;
    this.learned = prof.rom * 0.8;
    this.minTravel = Math.max(prof.signal === 'rise' ? 4 : 12, prof.rom * 0.35);
  }

  /** you left the frame: drop any half-finished rep and re-lock on your start position when you're back */
  resumeAfterGap(t: number) {
    this.armed = false;
    this.armNow = false;
    this.phase = 'rest';
    this.holdSince = 0;
    this.raw = [];
    this.f = new OneEuro();
    this.prevV = null;
    this.farOk = false;
    this.peak = 0;
    this.reverseChecked = true;
    this.lastMoveT = t;
  }

  /** end of set: if you stopped (or hit Done) on the way back from a real rep, count it */
  flush(t: number): RepStat | null {
    if (this.phase !== 'out' || !this.farOk || this.peak < Math.max(this.minTravel, this.learned * 0.6) || t - this.leaveT < 0.45) return null;
    this.phase = 'rest';
    this.firstRepStart ??= this.leaveT;
    const rep: RepStat = { t0: this.leaveT, t1: t, rom: this.peak, dur: t - this.leaveT };
    this.reps.push(rep);
    return rep;
  }

  /** returns a RepStat when a rep completes */
  push(t: number, f: Frame): RepStat | null {
    const r0 = readSignal(f, this.signal, this.ar, this.side);
    if (r0 == null) return null; // can't see the joint clearly: skip, don't guess
    // median of the last 3 readings: a single glitch frame can't make a rep
    this.raw.push(r0);
    if (this.raw.length > 3) this.raw.shift();
    const raw = [...this.raw].sort((a, b) => a - b)[Math.floor(this.raw.length / 2)];
    const v = this.f.filter(raw, t);
    this.value = v;
    if (this.prevV != null && Math.abs(v - this.prevV) / Math.max(1e-3, t - this.prevT) > this.minTravel * 0.25) this.lastMoveT = t;
    this.prevV = v;
    this.prevT = t;

    // 1. arm: hold still for 0.6 s; that position is your start
    if (!this.armed) {
      if (this.armNow) {
        this.armed = true;
        this.base = v;
        this.leaveT = t;
        return null;
      }
      if (!this.holdSince || Math.abs(v - this.holdVal) > this.minTravel * 0.35) {
        this.holdSince = t;
        this.holdVal = v;
      } else if (t - this.holdSince > 0.45) {
        this.armed = true;
        this.base = this.holdVal;
        this.leaveT = t;
      }
      return null;
    }

    const travel = (v - this.base) * this.dir; // > 0 = moving toward the far end
    this.progress = Math.max(0, Math.min(1, travel / this.learned));
    this.depth = travel;
    this.captureFrom = this.learned * 0.35;

    // locked on at the far end of a rep (e.g. top of a press): the way back is the end of rep 1
    if (this.phase === 'rest' && !this.reverseChecked && !this.reps.length && travel < -Math.max(this.minTravel, this.learned * 0.45)) {
      this.phase = 'back';
      this.backPeak = -travel;
      this.farOk = !this.farCheck || this.farCheck(f);
    }
    if (this.phase === 'back') {
      this.backPeak = Math.max(this.backPeak, -travel);
      // done when you pause at the start position, or turn around for the next rep
      const done = t - this.lastMoveT > 0.25 || -travel < this.backPeak - Math.max(this.minTravel * 0.5, this.backPeak * 0.15);
      if (done && (t - this.leaveT < 0.45 || this.backPeak < Math.max(this.minTravel, this.learned * 0.5) || !this.farOk)) {
        // too quick or too small to be a real rep (a tracking glitch): just treat this as the start position
        this.reverseChecked = true;
        this.phase = 'rest';
        this.base = v;
        this.leaveT = t;
        return null;
      }
      if (done) {
        this.reverseChecked = true;
        this.phase = 'rest';
        this.base = v;
        const rep: RepStat = { t0: this.leaveT, t1: t, rom: this.backPeak, dur: t - this.leaveT };
        this.firstRepStart ??= this.leaveT;
        this.learned = Math.max(this.backPeak, this.learned * 0.6);
        this.reps.push(rep);
        this.lastRepT = t;
        this.leaveT = t;
        return rep;
      }
      return null;
    }
    if (travel > this.learned * 0.45) this.reverseChecked = true;

    if (this.phase === 'rest') {
      if (travel < 0) this.base += (v - this.base) * 0.3; // went past the start (e.g. fuller lockout): that's the new start
      else if (travel < this.learned * 0.12) this.base += (v - this.base) * 0.02; // slow drift while resting
      if (travel < this.learned * 0.15) this.leaveT = t;
      if (travel > Math.max(this.minTravel * 0.6, this.learned * 0.45) && t - this.lastRepT > 0.3) {
        this.phase = 'out';
        this.peak = travel;
        this.farOk = !this.farCheck;
      }
      return null;
    }

    // phase 'out'
    if (travel > this.peak) this.peak = travel;
    if (!this.farOk && this.farCheck?.(f)) this.farOk = true;
    if (travel < this.peak * 0.3) {
      this.phase = 'rest';
      const dur = t - this.leaveT;
      const ok = dur >= 0.45 && dur <= 15 && this.peak >= Math.max(this.minTravel, this.learned * 0.5) && this.farOk;
      if (!ok) return null; // a twitch or a half-rep: ignore
      this.firstRepStart ??= this.leaveT;
      this.learned = this.reps.length ? this.learned * 0.7 + this.peak * 0.3 : Math.max(this.peak, this.learned * 0.6);
      const rep: RepStat = { t0: this.leaveT, t1: t, rom: this.peak, dur };
      this.reps.push(rep);
      this.lastRepT = t;
      this.leaveT = t;
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
  ...TRIPLES,
  rise: null,
  spread: null,
};

/** the side the camera sees better, for drawing an angle */
export function visibleTriple(f: Frame, sig: Signal): [number, number, number] | null {
  const t = JOINT_TRIPLES[sig];
  if (!t) return null;
  const v = (tr: [number, number, number]) => Math.min(...tr.map((i) => f.vis[i]));
  return v(t[0]) >= v(t[1]) ? t[0] : t[1];
}
