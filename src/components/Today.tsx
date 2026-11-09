import { ArrowRight, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { prepareAlarms, thump, unlockAudio } from '../lib/native';
import { shortLoad } from '../lib/load';
import { ago, estMinutes, lastDone, lastSets, nextDayId, startOfDay } from '../lib/progress';
import { startSession, useStore } from '../lib/store';

const spring = { type: 'spring', stiffness: 360, damping: 32 } as const;

export function Today() {
  const s = useStore((x) => x);
  const suggested = nextDayId(s);
  const [pick, setPick] = useState<string | undefined>(undefined);
  const dayId = pick ?? suggested;
  const day = s.days.find((d) => d.id === dayId);
  const now = new Date();

  if (!day) return <p className="muted pad">Add a training day in Program to get started.</p>;

  const prev = lastDone(s, day.id);
  const totalSets = day.exerciseIds.reduce((a, id) => a + (s.exercises[id]?.sets ?? 0), 0);

  const start = () => {
    unlockAudio();
    prepareAlarms();
    thump();
    startSession(day.id);
  };

  return (
    <div className="today">
      <header className="today-head">
        <span className="eyebrow">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <Week />
      </header>

      <motion.section className="hero" key={day.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <span className="eyebrow accent">{day.id === suggested ? 'Next up' : 'Selected'}</span>
        <h1 className="hero-title">{day.name}</h1>
        <p className="hero-focus">{day.focus}</p>
        <div className="hero-stats tnum">
          <div>
            <b>{day.exerciseIds.length}</b>
            <span>exercises</span>
          </div>
          <div>
            <b>{totalSets}</b>
            <span>sets</span>
          </div>
          <div>
            <b>~{estMinutes(s, day.exerciseIds)}</b>
            <span>min</span>
          </div>
          <div>
            <b>{prev ? ago(prev.start).replace(' ago', '') : '—'}</b>
            <span>{prev ? (ago(prev.start).endsWith('ago') ? 'ago' : 'last') : 'not yet'}</span>
          </div>
        </div>
        <motion.button className="btn-primary huge" onClick={start} whileTap={{ scale: 0.97 }}>
          <span className="play">
            <Play size={20} fill="currentColor" />
          </span>
          Start {day.name}
          <ArrowRight size={22} className="push-r" />
        </motion.button>
      </motion.section>

      <section className="plan-list">
        {day.exerciseIds.map((id, i) => {
          const ex = s.exercises[id];
          if (!ex) return null;
          const last = lastSets(s, id);
          const top = last?.sets.reduce((a, b) => (b.w > a.w || (b.w === a.w && b.r > a.r) ? b : a));
          return (
            <motion.div
              key={id}
              className="plan-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.04 * i }}
            >
              <span className="plan-n tnum">{String(i + 1).padStart(2, '0')}</span>
              <span className="plan-main">
                <b>{ex.name}</b>
                <small className="muted">
                  {ex.sets} × {ex.repMin}–{ex.repMax} · rest {Math.round(ex.rest / 6) / 10} min
                </small>
              </span>
              <span className="plan-last tnum">{top ? `${shortLoad(top, ex)}×${top.r}` : 'new'}</span>
            </motion.div>
          );
        })}
      </section>

      <section className="day-switch">
        <span className="eyebrow">Train something else</span>
        <div className="chips">
          {s.days.map((d) => (
            <button key={d.id} className={`chip ${d.id === day.id ? 'on' : ''}`} onClick={() => (thump(), setPick(d.id))}>
              {d.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Week() {
  const sessions = useStore((x) => x.sessions);
  const today = startOfDay(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * 864e5);
  const trained = new Set(sessions.filter((x) => x.end).map((x) => startOfDay(x.start)));
  const count = days.filter((d) => trained.has(d)).length;
  return (
    <div className="week">
      {days.map((d) => (
        <div key={d} className={`wk ${trained.has(d) ? 'on' : ''} ${d === today ? 'today' : ''}`}>
          <i />
          <span>{new Date(d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
        </div>
      ))}
      <div className="wk-count tnum">
        <b>{count}</b>
        <span>/ 7 days</span>
      </div>
    </div>
  );
}
