// Form check: what kind of movement an exercise is, whether the set looked like it, and per-rep form cues.
// Everything is measured from the 2D body points of the recording. The limits below are starting values
// meant to be tuned on real clips; each one is written so a clean rep never trips it.
import { angle2, J, JOINT_TRIPLES, type Frame, type Recording, type Signal } from './pose';
import type { Exercise } from './types';

export type Move = 'squat' | 'hinge' | 'lunge' | 'hpress' | 'pushup' | 'ohp' | 'vpull' | 'row' | 'curl' | 'triceps' | 'raise' | 'other';

const MOVES: [RegExp, Move][] = [
  [/upright row|lateral|front raise|y-raise/, 'raise'],
  [/leg ext|leg curl|nordic|glute-ham|leg press|calf|hip thrust|glute bridge|crunch|sit-?up|leg raise|knee raise|face pull|rear delt|reverse pec|fly|pec deck|crossover|pullover|straight-arm/, 'other'],
  [/pulldown|pull-?up|chin/, 'vpull'],
  [/row|inverted/, 'row'],
  [/back ext|good morning|deadlift|rdl|romanian|stiff|rack pull|pull-through|swing/, 'hinge'],
  [/lunge|split|step-up/, 'lunge'],
  [/squat|hack|pendulum|belt/, 'squat'],
  [/push-?up/, 'pushup'],
  [/overhead press|shoulder press|military|push press|arnold|ohp|landmine press/, 'ohp'],
  [/bench|incline|decline|chest press|dip|floor press/, 'hpress'],
  [/pushdown|push-down|kickback|skull|triceps|tricep|extension|jm press/, 'triceps'],
  [/curl/, 'curl'],
];

export function moveFor(ex: Exercise): Move {
  const n = ex.name.toLowerCase();
  if (ex.muscle === 'Shoulders' && /press/.test(n)) return 'ohp';
  for (const [re, m] of MOVES) if (re.test(n)) return m;
  return 'other';
}

/* ---------- geometry ---------- */

const { H, LS, RS, LE, RE, LW, RW, LH, RH, LK, RK, LA, RA } = J;
type S = 'L' | 'R';
const side = (s: S) =>
  s === 'L' ? { S: LS, E: LE, W: LW, H: LH, K: LK, A: LA } : { S: RS, E: RE, W: RW, H: RH, K: RK, A: RA };
const x = (f: Frame, i: number) => f.p[i * 2];
const y = (f: Frame, i: number) => f.p[i * 2 + 1];
const ok = (f: Frame, ...i: number[]) => i.every((k) => f.vis[k] > 0.45);

interface Ctx {
  ar: number;
  s: S;
  torso: number; // shoulder-to-hip length in the image, the ruler for every distance
  facing: 1 | -1; // which way the nose points along x
}

function ang(f: Frame, c: Ctx, sig: Exclude<Signal, 'rise' | 'spread'>): number | null {
  const t = JOINT_TRIPLES[sig]![c.s === 'L' ? 0 : 1];
  return ok(f, ...t) ? angle2(f, c.ar, t) : null;
}

/** torso angle from upright, in degrees (0 = standing tall), signed: + = leaning the way you face */
function lean(f: Frame, c: Ctx): number | null {
  const j = side(c.s);
  if (!ok(f, j.S, j.H)) return null;
  const dx = (x(f, j.S) - x(f, j.H)) * c.ar;
  const dy = y(f, j.H) - y(f, j.S);
  return (Math.atan2(dx * c.facing, dy) * 180) / Math.PI;
}

const nums = (v: (number | null)[]) => v.filter((n): n is number => n != null && Number.isFinite(n));
const spread = (v: number[]) => {
  if (v.length < 3) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.9)] - s[Math.floor(s.length * 0.1)];
};
/** frame where a value is lowest */
const argMin = (fs: Frame[], val: (f: Frame) => number | null) => {
  let best: Frame | null = null;
  let bv = Infinity;
  for (const f of fs) {
    const v = val(f);
    if (v != null && v < bv) {
      bv = v;
      best = f;
    }
  }
  return best;
};

function context(rec: Recording): Ctx | null {
  const fs = rec.frames;
  if (!fs.length) return null;
  const ar = rec.ar ?? 4 / 3;
  const visSide = (k: S) => fs.reduce((a, f) => a + Object.values(side(k)).reduce((b, i) => b + f.vis[i], 0), 0);
  const s: S = rec.side === 'L' || rec.side === 'R' ? rec.side : visSide('L') >= visSide('R') ? 'L' : 'R';
  const torsos = nums(fs.map((f) => (ok(f, LS, RS, LH, RH) ? Math.abs((y(f, LS) + y(f, RS)) / 2 - (y(f, LH) + y(f, RH)) / 2) : null)));
  const arms = nums(fs.map((f) => (ok(f, side(s).S, side(s).E) ? Math.hypot((x(f, side(s).S) - x(f, side(s).E)) * ar, y(f, side(s).S) - y(f, side(s).E)) * 1.6 : null)));
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const torso = Math.max(0.05, torsos.length ? med(torsos) : arms.length ? med(arms) : 0.25);
  const noseAhead = nums(fs.map((f) => (ok(f, H, LS, RS) ? x(f, H) - (x(f, LS) + x(f, RS)) / 2 : null)));
  const facing = noseAhead.length && med(noseAhead) < 0 ? -1 : 1;
  return { ar, s, torso, facing };
}

/* ---------- cues ---------- */

export interface Cue {
  id: string;
  title: string; // what went wrong, in plain words
  fix: string; // what to do next set
  joints: (c: Ctx) => number[]; // body points to highlight on the photo
  /** > 1 = this rep had the problem; bigger = worse. null = couldn't see it */
  test: (fs: Frame[], c: Ctx) => number | null;
}

const leanRange = (fs: Frame[], c: Ctx) => {
  const v = nums(fs.map((f) => lean(f, c)));
  return v.length >= 4 ? spread(v) : null;
};
const torsoJoints = (c: Ctx) => [side(c.s).S, side(c.s).H];

const swing = (limit: number, title: string, fix: string): Cue => ({
  id: 'swing',
  title,
  fix,
  joints: torsoJoints,
  test: (fs, c) => {
    const r = leanRange(fs, c);
    return r == null ? null : r / limit;
  },
});

const lockout = (limit: number, title: string, fix: string): Cue => ({
  id: 'lockout',
  title,
  fix,
  joints: (c) => [side(c.s).S, side(c.s).E, side(c.s).W],
  test: (fs, c) => {
    const v = nums(fs.map((f) => ang(f, c, 'elbow')));
    if (v.length < 4) return null;
    const top = Math.max(...v);
    return top < limit ? 1 + (limit - top) / 20 : 0;
  },
});

const uneven: Cue = {
  id: 'uneven',
  title: 'One arm lagging behind the other',
  fix: 'Press both hands up together; if one side always lags, use a lighter weight until it keeps up.',
  joints: () => [LW, RW],
  test: (fs, c) => {
    const top = argMin(fs, (f) => (ok(f, LW, RW) ? (y(f, LW) + y(f, RW)) / 2 : null));
    if (!top) return null;
    return Math.abs(y(top, LW) - y(top, RW)) / (c.torso * 0.18);
  },
};

const CUES: Record<Move, Cue[]> = {
  curl: [
    {
      id: 'elbow-drift',
      title: 'Elbows drifting forward',
      fix: 'Pin your elbows to your sides; only your forearms should move.',
      joints: (c) => [side(c.s).S, side(c.s).E],
      test: (fs, c) => {
        // the upper arm should stay by your side: how far it swings forward at the top of the curl
        const top = argMin(fs, (f) => ang(f, c, 'elbow'));
        const start = fs.slice(0, 3).map((f) => ang(f, c, 'shoulder'));
        const s0 = nums(start)[0];
        const s1 = top ? ang(top, c, 'shoulder') : null;
        return s0 == null || s1 == null ? null : (s1 - s0) / 30;
      },
    },
    swing(12, 'Swinging your body to lift', 'Stand tall and brace; if you have to swing, the weight is too heavy.'),
  ],
  triceps: [
    {
      id: 'elbow-drift',
      title: 'Upper arms moving',
      fix: 'Lock your upper arms in place; bend and straighten only at the elbow.',
      joints: (c) => [side(c.s).S, side(c.s).E],
      test: (fs, c) => {
        const v = nums(fs.map((f) => ang(f, c, 'shoulder')));
        return v.length >= 4 ? spread(v) / 25 : null;
      },
    },
    swing(14, 'Rocking your body into it', 'Plant your feet and keep your chest still; let the triceps do the work.'),
  ],
  vpull: [
    swing(15, 'Swinging back to pull', 'Pick a slight lean and hold it; pull with your back, not momentum.'),
    {
      id: 'too-low',
      title: 'Pulling down toward your stomach',
      fix: 'Bring the bar to your upper chest and stop there.',
      joints: (c) => [side(c.s).S, side(c.s).W],
      test: (fs, c) => {
        const j = side(c.s);
        const bottom = argMin(fs, (f) => ang(f, c, 'elbow'));
        if (!bottom || !ok(bottom, j.W, j.S)) return null;
        return (y(bottom, j.W) - y(bottom, j.S)) / (c.torso * 0.45);
      },
    },
    {
      id: 'behind-neck',
      title: 'Pulling behind your neck',
      fix: 'Pull the bar in front of your face, down to your upper chest. Behind the neck strains the shoulders.',
      joints: (c) => [H, side(c.s).W],
      test: (fs, c) => {
        const j = side(c.s);
        const bottom = argMin(fs, (f) => ang(f, c, 'elbow'));
        if (!bottom || !ok(bottom, j.W, j.S, H)) return null;
        // hands end up on the far side of the shoulders from where you face, at head height
        const behind = ((x(bottom, j.S) - x(bottom, j.W)) * c.facing * c.ar) / c.torso;
        const atHead = y(bottom, j.W) < y(bottom, j.S) + c.torso * 0.15;
        return atHead ? behind / 0.18 : 0;
      },
    },
  ],
  row: [swing(15, 'Using your body to row', 'Keep your chest still; only your arms and shoulder blades should move.')],
  squat: [
    {
      id: 'depth',
      title: 'Not reaching depth',
      fix: 'Sit down until your hips are level with your knees, or lower the weight until you can.',
      joints: (c) => [side(c.s).H, side(c.s).K],
      test: (fs, c) => {
        const j = side(c.s);
        const bottom = argMin(fs, (f) => ang(f, c, 'knee'));
        if (!bottom || !ok(bottom, j.H, j.K)) return null;
        // hips still above the knees by more than a hand's width
        return (y(bottom, j.K) - y(bottom, j.H)) / (c.torso * 0.2);
      },
    },
    {
      id: 'lean',
      title: 'Leaning far forward',
      fix: 'Chest up and brace hard; keep the weight over the middle of your feet.',
      joints: torsoJoints,
      test: (fs, c) => {
        const bottom = argMin(fs, (f) => ang(f, c, 'knee'));
        const l = bottom ? lean(bottom, c) : null;
        return l == null ? null : Math.abs(l) / 55;
      },
    },
  ],
  hinge: [
    {
      id: 'squatty',
      title: 'Bending your knees too much',
      fix: 'Soft knees only; push your hips back as if closing a door behind you.',
      joints: (c) => [side(c.s).H, side(c.s).K],
      test: (fs, c) => {
        const k = nums(fs.map((f) => ang(f, c, 'knee')));
        const h = nums(fs.map((f) => ang(f, c, 'hip')));
        if (k.length < 4 || h.length < 4) return null;
        const kr = spread(k);
        // a hinge moves the hips much more than the knees
        return kr > 35 && kr > spread(h) * 0.8 ? kr / 35 : 0;
      },
    },
    {
      id: 'drift',
      title: 'Weight drifting away from your legs',
      fix: 'Keep the bar or dumbbells brushing your legs the whole way down.',
      joints: (c) => [side(c.s).W, side(c.s).A],
      test: (fs, c) => {
        const j = side(c.s);
        const bottom = argMin(fs, (f) => ang(f, c, 'hip'));
        if (!bottom || !ok(bottom, j.W, j.K)) return null;
        const ref = ok(bottom, j.A) ? x(bottom, j.A) : x(bottom, j.K);
        return (Math.abs(x(bottom, j.W) - ref) * c.ar) / (c.torso * 0.6);
      },
    },
    {
      id: 'chest-drop',
      title: 'Upper back may be rounding',
      fix: 'Chest proud and shoulders back before you bend; keep your head in line with your back.',
      joints: (c) => [H, side(c.s).S, side(c.s).H],
      test: (fs, c) => {
        const j = side(c.s);
        const bottom = argMin(fs, (f) => ang(f, c, 'hip'));
        if (!bottom || !ok(bottom, H, j.S, j.H)) return null;
        // angle between hips→shoulders and shoulders→head: a straight back keeps the head roughly in line
        const bend = 180 - (angle2(bottom, c.ar, [j.H, j.S, H]) ?? 180);
        return bend / 65;
      },
    },
  ],
  lunge: [
    {
      id: 'lean',
      title: 'Leaning forward',
      fix: 'Keep your chest tall and drop straight down between your feet.',
      joints: torsoJoints,
      test: (fs, c) => {
        const bottom = argMin(fs, (f) => ang(f, c, 'knee'));
        const l = bottom ? lean(bottom, c) : null;
        return l == null ? null : Math.abs(l) / 30;
      },
    },
  ],
  ohp: [
    lockout(150, 'Not pressing all the way up', 'Finish each rep with your arms straight and the weight over your head.'),
    uneven,
  ],
  hpress: [lockout(145, 'Not locking out at the top', 'Press until your arms are straight before the next rep.')],
  pushup: [
    {
      id: 'sag',
      title: 'Body not in a straight line',
      fix: 'Squeeze your glutes and brace your stomach so your body moves as one plank.',
      joints: (c) => [side(c.s).S, side(c.s).H, side(c.s).K],
      test: (fs, c) => {
        const v = nums(fs.map((f) => ang(f, c, 'hip')));
        return v.length < 4 ? null : (180 - Math.min(...v)) / 25;
      },
    },
  ],
  raise: [
    {
      id: 'too-high',
      title: 'Raising too high',
      fix: 'Stop when your hands reach shoulder height; above that your traps take over.',
      joints: () => [LS, RS, LW, RW],
      test: (fs, c) => {
        const top = argMin(fs, (f) => (ok(f, LW, RW) ? (y(f, LW) + y(f, RW)) / 2 : null));
        if (!top || !ok(top, LS, RS)) return null;
        const above = (y(top, LS) + y(top, RS)) / 2 - (y(top, LW) + y(top, RW)) / 2;
        return above / (c.torso * 0.22);
      },
    },
    uneven,
  ],
  other: [],
};

/* ---------- "does this look like the exercise you picked?" ---------- */

const NAME: Record<Move, string> = {
  squat: 'a squat',
  hinge: 'a hinge (deadlift / RDL)',
  lunge: 'a lunge',
  hpress: 'a press',
  pushup: 'a push-up',
  ohp: 'an overhead press',
  vpull: 'a pulldown or pull-up',
  row: 'a row',
  curl: 'a curl',
  triceps: 'a triceps exercise',
  raise: 'a raise',
  other: 'this exercise',
};

function mismatch(move: Move, rec: Recording, c: Ctx): string | null {
  const fs = rec.frames;
  const r = (sig: Exclude<Signal, 'rise' | 'spread'>) => {
    const v = nums(fs.map((f) => ang(f, c, sig)));
    return v.length >= 8 ? spread(v) : null;
  };
  const knee = r('knee');
  const hip = r('hip');
  const elbow = r('elbow');
  const shoulder = r('shoulder');
  const legs = Math.max(knee ?? 0, hip ?? 0);
  const say = (what: string) => `This didn't look like ${NAME[move]}: ${what}. Form tips are skipped for this set; check you picked the right exercise.`;
  switch (move) {
    case 'squat':
    case 'lunge':
      if (knee != null && knee < 30 && (elbow ?? 0) > 40) return say('your knees barely bent but your arms did');
      if (knee != null && hip != null && knee < 25 && hip > 40) return say('your hips moved but your knees hardly bent, more like a deadlift');
      return null;
    case 'hinge':
      if (hip != null && hip < 25 && (elbow ?? 0) > 40) return say('your hips barely moved but your arms did');
      return null;
    case 'curl':
    case 'triceps':
    case 'row':
    case 'vpull':
    case 'hpress':
    case 'ohp':
      // your arms always move a little under a bar, so compare: the legs moving far more than the arms means it wasn't an arm exercise
      if (elbow != null && legs > 45 && legs > elbow * 1.8) return say('your legs and hips did the moving, not your arms');
      return null;
    case 'raise':
      if (shoulder != null && shoulder < 20 && (elbow ?? 0) > 50) return say('your arms bent at the elbow instead of rising from the shoulder');
      return null;
    default:
      return null;
  }
}

/* ---------- the report ---------- */

export interface Finding {
  id: string;
  title: string;
  fix: string;
  reps: number[]; // 0-based rep indexes where it happened
  worst: number; // the rep that shows it best
  joints: number[]; // points to circle on that rep's photo
}

export interface FormReport {
  move: Move;
  checked: boolean; // were there cues for this exercise that could be measured?
  mismatch: string | null;
  findings: Finding[]; // worst first, at most 3
}

export function checkForm(ex: Exercise, rec: Recording): FormReport {
  const move = moveFor(ex);
  const c = context(rec);
  const empty: FormReport = { move, checked: false, mismatch: null, findings: [] };
  if (!c) return empty;
  // checked even with no reps counted: doing the wrong exercise is the usual reason none were
  const mm = mismatch(move, rec, c);
  if (mm) return { ...empty, mismatch: mm };
  if (!rec.reps.length) return empty;
  const n = rec.reps.length;
  const findings: (Finding & { sev: number })[] = [];
  let measured = false;
  for (const cue of CUES[move]) {
    const scores = rec.reps.map((rep) => {
      const fs = rec.frames.filter((f) => f.t >= rep.t0 - 0.1 && f.t <= rep.t1 + 0.1);
      return fs.length >= 3 ? cue.test(fs, c) : null;
    });
    if (import.meta.env.DEV) ((globalThis as unknown as { __cueScores: Record<string, unknown> }).__cueScores ??= {})[cue.id] = scores.map((s) => (s == null ? null : +s.toFixed(2)));
    if (scores.some((s) => s != null)) measured = true;
    // dev only: ?teststrict halves every limit, to preview how problems are shown
    const limit = import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('teststrict') ? 0.5 : 1;
    const hit = scores.map((s, i) => (s != null && s > limit ? i : -1)).filter((i) => i >= 0);
    // one odd rep is usually tracking noise; a real habit shows up on about a third of the reps
    if (!hit.length || hit.length < Math.ceil(n * 0.3)) continue;
    const worst = hit.reduce((a, i) => (scores[i]! > scores[a]! ? i : a), hit[0]);
    findings.push({ id: cue.id, title: cue.title, fix: cue.fix, reps: hit, worst, joints: cue.joints(c), sev: (hit.length / n) * scores[worst]! });
  }
  findings.sort((a, b) => b.sev - a.sev);
  return { move, checked: measured, mismatch: null, findings: findings.slice(0, 3).map(({ sev: _s, ...f }) => f) };
}

export const repList = (reps: number[]) =>
  reps.length === 1 ? `Rep ${reps[0] + 1}` : `Reps ${reps.slice(0, -1).map((r) => r + 1).join(', ')} and ${reps[reps.length - 1] + 1}`;
