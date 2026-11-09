import { Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { shortLoad, toShow, unitLabel } from '../lib/load';
import { ago, series, volume } from '../lib/progress';
import { deleteSession, useStore } from '../lib/store';
import { SessionSets, SetChips } from './SetEdit';
import { Sheet } from './Sheet';

export function Progress() {
  const s = useStore((x) => x);
  const [open, setOpen] = useState<string | null>(null);
  const [workout, setWorkout] = useState<string | null>(null);
  const done = s.sessions.filter((x) => x.end);
  const ids = s.days.flatMap((d) => d.exerciseIds).filter((id, i, a) => a.indexOf(id) === i);
  const rows = ids.map((id) => ({ ex: s.exercises[id], pts: series(s, id) })).filter((r) => r.ex && r.pts.length);

  if (!done.length)
    return (
      <div className="empty">
        <div className="empty-art">
          <Spark pts={[3, 4, 3.6, 5, 4.8, 6, 6.6]} w={220} h={70} />
        </div>
        <h2>Your progress shows up here</h2>
        <p className="muted">Finish your first workout and every lift gets its own trend line.</p>
      </div>
    );

  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = done.filter((x) => x.start > weekAgo);

  return (
    <div className="progress">
      <header className="page-head">
        <h1>Progress</h1>
      </header>
      <div className="stat-row tnum">
        <div className="stat">
          <b>{done.length}</b>
          <span>workouts</span>
        </div>
        <div className="stat">
          <b>{thisWeek.length}</b>
          <span>this week</span>
        </div>
        <div className="stat">
          <b>{Math.round(thisWeek.reduce((a, x) => a + volume(x.sets), 0) / 1000)}</b>
          <span>t lifted / wk</span>
        </div>
      </div>

      <span className="eyebrow">Lifts · estimated 1-rep max</span>
      <div className="lift-list">
        {rows.map(({ ex, pts }, i) => {
          const first = pts[0].v;
          const lastP = pts[pts.length - 1];
          const ch = first ? ((lastP.v - first) / first) * 100 : 0;
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
                <small className="muted tnum">
                  top {shortLoad(lastP.top, ex)}×{lastP.top.r} · {ago(lastP.t)}
                </small>
              </span>
              <Spark pts={pts.map((p) => p.v)} w={84} h={32} />
              <span className="lift-val tnum">
                <b>{Math.round(toShow(lastP.v, ex))}</b>
                {pts.length > 1 && (
                  <small className={ch >= 0 ? 'up' : 'down'}>
                    {ch >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(ch).toFixed(0)}%
                  </small>
                )}
              </span>
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
            const day = s.days.find((d) => d.id === ses.dayId);
            const mins = Math.round(((ses.end ?? ses.start) - ses.start) / 60000);
            return (
              <div key={ses.id} className="hist-row">
                <button className="row-main left" onClick={() => setWorkout(ses.id)}>
                  <b>{day?.name ?? 'Workout'}</b>
                  <small className="muted tnum">
                    {new Date(ses.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {mins} min ·{' '}
                    {ses.sets.length} sets · {Math.round(volume(ses.sets)).toLocaleString()} kg
                  </small>
                </button>
                <button
                  className="icon-btn subtle"
                  aria-label="Delete workout"
                  onClick={() => confirm('Delete this workout from your history?') && deleteSession(ses.id)}
                >
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

function LiftDetail({ exId }: { exId: string }) {
  const s = useStore((x) => x);
  const ex = s.exercises[exId];
  const pts = series(s, exId);
  const best = pts.reduce((a, b) => (b.v > a.v ? b : a), pts[0]);
  const sessions = s.sessions.filter((x) => x.end && x.sets.some((y) => y.exId === exId)).reverse();
  return (
    <div className="stack">
      <div className="detail-chart">
        <Spark pts={pts.map((p) => p.v)} w={340} h={120} big />
      </div>
      <div className="stat-row tnum">
        <div className="stat">
          <b>{Math.round(toShow(best.v, ex))}</b>
          <span>best est. {unitLabel(ex)}</span>
        </div>
        <div className="stat">
          <b>
            {shortLoad(best.top, ex)}×{best.top.r}
          </b>
          <span>best set</span>
        </div>
        <div className="stat">
          <b>{pts.length}</b>
          <span>sessions</span>
        </div>
      </div>
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
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${x(vals.length - 1)},${h} L${x(0)},${h} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={big ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={big ? 5 : 3} fill="var(--accent)" />
    </svg>
  );
}
