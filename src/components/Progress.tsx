import { ChevronRight, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { loadText, toShow, unitLabel } from '../lib/load';
import { fmtW, startOfDay, topSets } from '../lib/progress';
import { deleteSession, useStore } from '../lib/store';
import type { Exercise, Session, SetLog } from '../lib/types';
import { SessionSets, SetChips } from './SetEdit';
import { Sheet } from './Sheet';

type Pt = { t: number; set: SetLog };
/** when the weight never changed, the story is in the reps: chart those instead */
const byReps = (pts: Pt[]) => pts.length > 1 && pts.every((p) => p.set.w === pts[0].set.w);
const series = (pts: Pt[], ex: Exercise) => pts.map((p) => (byReps(pts) ? p.set.r : toShow(p.set.w, ex)));
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** How a lift has moved, in plain words: "+10 kg since 3 Oct" or "+3 reps at 60 kg" */
function change(pts: Pt[], ex: Exercise): { text: string; dir: 'up' | 'down' | 'same' } {
  if (pts.length < 2) return { text: 'First session logged', dir: 'same' };
  const a = pts[0].set;
  const b = pts[pts.length - 1].set;
  const dw = +(toShow(b.w, ex) - toShow(a.w, ex)).toFixed(1);
  if (dw !== 0) return { text: `${dw > 0 ? '+' : '−'}${fmtW(Math.abs(dw))} ${unitLabel(ex)} since ${day(pts[0].t)}`, dir: dw > 0 ? 'up' : 'down' };
  const dr = b.r - a.r;
  if (dr !== 0) return { text: `${dr > 0 ? '+' : '−'}${Math.abs(dr)} rep${Math.abs(dr) === 1 ? '' : 's'} at ${loadText(b.w, ex, b.u)}`, dir: dr > 0 ? 'up' : 'down' };
  return { text: `Same as ${day(pts[0].t)}`, dir: 'same' };
}

export function Progress() {
  const s = useStore((x) => x);
  const [open, setOpen] = useState<string | null>(null);
  const [workout, setWorkout] = useState<string | null>(null);
  const done = s.sessions.filter((x) => x.end);
  const ids = [...s.days.flatMap((d) => d.exerciseIds), ...done.flatMap((x) => x.sets.map((y) => y.exId))].filter((id, i, a) => a.indexOf(id) === i);
  const rows = ids.map((id) => ({ ex: s.exercises[id], pts: topSets(s, id) })).filter((r) => r.ex && r.pts.length);

  if (!done.length)
    return (
      <div className="empty">
        <div className="empty-art">
          <Spark pts={[3, 4, 3.6, 5, 4.8, 6, 6.6]} w={220} h={70} />
        </div>
        <h2>Your progress shows up here</h2>
        <p className="muted">Finish your first workout and every lift gets its own chart.</p>
      </div>
    );

  return (
    <div className="progress">
      <header className="page-head">
        <h1>Progress</h1>
      </header>

      <Weeks sessions={done} />

      <span className="eyebrow">Your lifts · heaviest set each workout</span>
      <div className="lift-list">
        {rows.map(({ ex, pts }, i) => {
          const last = pts[pts.length - 1].set;
          const ch = change(pts, ex);
          return (
            <motion.button
              key={ex.id}
              className="lift"
              onClick={() => setOpen(ex.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <span className="lift-main">
                <b>{ex.name}</b>
                <span className="lift-now tnum">
                  {loadText(last.w, ex, last.u)} × {last.r}
                </span>
                <small className={`lift-ch ${ch.dir}`}>{ch.text}</small>
              </span>
              {pts.length > 1 && <Spark pts={series(pts, ex)} w={72} h={34} />}
              <ChevronRight size={18} className="muted" />
            </motion.button>
          );
        })}
      </div>

      <span className="eyebrow">Recent workouts</span>
      <div className="hist">
        {[...done]
          .reverse()
          .slice(0, 12)
          .map((ses) => {
            const d = s.days.find((x) => x.id === ses.dayId);
            const mins = Math.round(((ses.end ?? ses.start) - ses.start) / 60000);
            return (
              <div key={ses.id} className="hist-row">
                <button className="row-main left" onClick={() => setWorkout(ses.id)}>
                  <b>{d?.name ?? 'Workout'}</b>
                  <small className="muted tnum">
                    {new Date(ses.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {mins} min · {ses.sets.length} sets
                  </small>
                </button>
                <button className="icon-btn subtle" aria-label="Delete workout" onClick={() => confirm('Delete this workout from your history?') && deleteSession(ses.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? s.exercises[open]?.name : ''}>
        {open && <LiftDetail exId={open} />}
      </Sheet>
      <Sheet open={!!workout} onClose={() => setWorkout(null)} title="Tap a set to fix it">
        {workout && <SessionSets sessionId={workout} />}
      </Sheet>
    </div>
  );
}

/* ---------- consistency: workouts per week, last 8 weeks ---------- */

function weekStart(t: number) {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

function Weeks({ sessions }: { sessions: Session[] }) {
  const now = weekStart(Date.now());
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(now);
    start.setDate(start.getDate() - (7 - i) * 7);
    const t = start.getTime();
    const sets = sessions.filter((x) => weekStart(x.start) === t);
    return { t, n: sets.length, sets: sets.reduce((a, x) => a + x.sets.length, 0) };
  });
  const [sel, setSel] = useState(7);
  const max = Math.max(3, ...weeks.map((w) => w.n));
  const cur = weeks[sel];
  const active = weeks.filter((w) => w.n > 0);
  const avg = active.length ? weeks.reduce((a, w) => a + w.n, 0) / 8 : 0;
  return (
    <section className="weeks">
      <div className="weeks-head">
        <div>
          <span className="eyebrow">{sel === 7 ? 'This week' : `Week of ${day(cur.t)}`}</span>
          <b className="tnum">
            {cur.n} workout{cur.n === 1 ? '' : 's'}
            <small> · {cur.sets} sets</small>
          </b>
        </div>
        <span className="muted small tnum">avg {avg.toFixed(1)} / week</span>
      </div>
      <div className="weeks-bars" role="img" aria-label={`Workouts per week, last 8 weeks: ${weeks.map((w) => w.n).join(', ')}`}>
        {weeks.map((w, i) => (
          <button key={w.t} className={`wk ${i === sel ? 'sel' : ''}`} onClick={() => setSel(i)} aria-label={`Week of ${day(w.t)}: ${w.n} workouts`}>
            <span className="wk-track">
              <motion.i initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.03 }} style={{ height: w.n ? `${(w.n / max) * 100}%` : 3 }} className={w.n ? '' : 'zero'} />
            </span>
            <small className="tnum">{i === 7 ? 'now' : new Date(w.t).getDate()}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- one lift ---------- */

function LiftDetail({ exId }: { exId: string }) {
  const s = useStore((x) => x);
  const ex = s.exercises[exId];
  const pts = topSets(s, exId);
  if (!pts.length) return <p className="muted">No finished workouts with this lift yet.</p>;
  const last = pts[pts.length - 1].set;
  const best = pts.reduce((a, b) => (b.set.w > a.set.w || (b.set.w === a.set.w && b.set.r > a.set.r) ? b : a), pts[0]);
  const ch = change(pts, ex);
  const sessions = s.sessions.filter((x) => x.end && x.sets.some((y) => y.exId === exId)).reverse();
  return (
    <div className="stack">
      <div className="lift-hero">
        <span className="eyebrow">Last time · heaviest set</span>
        <b className="tnum">
          {loadText(last.w, ex, last.u)} × {last.r}
        </b>
        <span className={`lift-ch ${ch.dir}`}>{ch.text}</span>
      </div>
      {pts.length > 1 ? <LiftChart key={exId} pts={pts} ex={ex} /> : <p className="muted small">Your chart starts after the next workout with this lift.</p>}
      <div className="lift-facts tnum">
        <div>
          <span>Best set</span>
          <b>
            {loadText(best.set.w, ex, best.set.u)} × {best.set.r}
          </b>
          <small>{day(best.t)}</small>
        </div>
        <div>
          <span>Workouts</span>
          <b>{pts.length}</b>
          <small>since {day(pts[0].t)}</small>
        </div>
      </div>
      <span className="eyebrow">Every set · tap to fix</span>
      {sessions.map((ses) => (
        <div key={ses.id} className="hist-row">
          <span className="row-main">
            <small className="muted">{new Date(ses.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
            <SetChips sessionId={ses.id} sets={ses.sets.filter((x) => x.exId === exId)} ex={ex} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** heaviest set per workout over time: real dates on x, your weight on y; tap or drag to read any point */
function LiftChart({ pts, ex }: { pts: Pt[]; ex: Exercise }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(320);
  const [sel, setSel] = useState(pts.length - 1);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 190;
  const L = 34; // y labels
  const R = 14;
  const T = 30; // room for the label over the selected dot
  const B = 24; // date labels
  const reps = byReps(pts);
  const vals = series(pts, ex);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1e-6) {
    lo -= reps ? 2 : 5;
    hi += reps ? 2 : 5;
  }
  const padV = (hi - lo) * 0.12;
  lo = Math.max(0, lo - padV);
  hi += padV;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const X = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  // three gridlines on round numbers
  const raw = (hi - lo) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => +(lo + i * step).toFixed(2));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(vals[i]).toFixed(1)}`).join(' ');
  const p = pts[sel];
  const sx = X(p.t);
  const sy = Y(vals[sel]);
  const pick = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const x = clientX - r.left;
    let k = 0;
    pts.forEach((q, i) => {
      if (Math.abs(X(q.t) - x) < Math.abs(X(pts[k].t) - x)) k = i;
    });
    setSel(k);
  };
  const tip = `${loadText(p.set.w, ex, p.set.u)} × ${p.set.r}`;
  const tipW = tip.length * 7.2 + 18;
  const tipX = Math.min(W - R - tipW / 2, Math.max(L + tipW / 2, sx));
  return (
    <div
      ref={wrap}
      className="lift-chart"
      onClick={(e) => pick(e.clientX)}
      onPointerMove={(e) => e.buttons && pick(e.clientX)}
      role="img"
      aria-label={`${ex.name}: heaviest set per workout, from ${loadText(pts[0].set.w, ex)} to ${loadText(pts[pts.length - 1].set.w, ex)}`}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="lc-grid" />
            <text x={L - 8} y={Y(v)} className="lc-axis" textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}
        <text x={L - 8} y={T - 16} className="lc-axis" textAnchor="end">
          {reps ? 'reps' : unitLabel(ex)}
        </text>
        <path d={`${d} L${X(t1)},${H - B} L${X(t0)},${H - B} Z`} fill="url(#lc-fill)" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={sx} x2={sx} y1={T - 4} y2={H - B} className="lc-cross" />
        {pts.map((q, i) => (
          <circle key={q.t} cx={X(q.t)} cy={Y(vals[i])} r={i === sel ? 6 : 4} className={`lc-dot ${i === sel ? 'sel' : ''}`} />
        ))}
        <g transform={`translate(${tipX},${Math.max(12, sy - 22)})`}>
          <rect x={-tipW / 2} y={-11} width={tipW} height={22} rx={11} className="lc-tip" />
          <text textAnchor="middle" dominantBaseline="middle" y={1} className="lc-tip-text">
            {tip}
          </text>
        </g>
        <text x={L} y={H - 6} className="lc-axis">
          {day(t0)}
        </text>
        <text x={W - R} y={H - 6} className="lc-axis" textAnchor="end">
          {day(t1)}
        </text>
        {sel !== 0 && sel !== pts.length - 1 && (
          <text x={sx} y={H - 6} className="lc-axis strong" textAnchor="middle">
            {day(p.t)}
          </text>
        )}
      </svg>
    </div>
  );
}

export function Spark({ pts, w, h, big }: { pts: number[]; w: number; h: number; big?: boolean }) {
  if (pts.length === 0) return null;
  const vals = pts.length === 1 ? [pts[0], pts[0]] : pts;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = big ? 10 : 4;
  const x = (i: number) => pad + (i / (vals.length - 1)) * (w - pad * 2);
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2));
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const id = 'sg' + w + h;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${x(vals.length - 1)},${h} L${x(0)},${h} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={big ? 5 : 3} fill="var(--accent)" />
    </svg>
  );
}


