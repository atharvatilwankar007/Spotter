import { Camera, Check, ChevronRight, List, Plus, RotateCcw, SkipForward, Undo2, X } from 'lucide-react';
import { listGhosts } from '../lib/ghostdb';
import type { Recording } from '../lib/pose';
import { Figure } from './Figure';
import { ExercisePicker } from './ExercisePicker';
import { GhostCam } from './GhostCam';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buzzDone,
  buzzWarn,
  cancelRestAlarm,
  chimeDone,
  chimeWarn,
  scheduleRestAlarm,
  stayAwake,
  thump,
  unlockAudio,
  webNotify,
} from '../lib/native';
import { ago, e1rm, fmtW, lastSets, mmss, prefill, target, bestE1rm } from '../lib/progress';
import {
  addExerciseToSession,
  adjustRest,
  discardSession,
  endRest,
  finishSession,
  getState,
  goToExercise,
  logSet,
  startRest,
  undoLastSet,
  useStore,
} from '../lib/store';
import type { Exercise, SetLog } from '../lib/types';
import { Scrubber } from './Scrubber';
import { Sheet } from './Sheet';

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const;

export function SessionScreen({ onFinished }: { onFinished: (id: string | null) => void }) {
  const s = useStore((x) => x);
  const a = s.active!;
  const session = s.sessions.find((x) => x.id === a.sessionId)!;
  const day = s.days.find((d) => d.id === session.dayId);
  const ex = s.exercises[a.order[a.exIdx]];
  const [listOpen, setListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    stayAwake(true);
    return () => {
      stayAwake(false);
    };
  }, []);

  // ring through the lock screen: schedule the native alarm when the app goes to the background
  useEffect(() => {
    const onVis = () => {
      const cur = getState().active;
      if (document.hidden && cur?.phase === 'rest') {
        const next = getState().exercises[cur.order[cur.exIdx]];
        scheduleRestAlarm(cur.restEndsAt, next ? `${next.name} — you're up` : 'Time for your next set');
      } else if (!document.hidden) {
        cancelRestAlarm();
        stayAwake(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const finish = () => {
    cancelRestAlarm();
    onFinished(finishSession());
  };

  if (!ex) {
    return (
      <div className="session">
        <p className="muted pad">This exercise no longer exists.</p>
        <button className="btn-primary" onClick={finish}>
          Finish workout
        </button>
      </div>
    );
  }

  return (
    <div className="session">
      <TopBar
        title={day?.name ?? 'Workout'}
        start={session.start}
        order={a.order}
        exIdx={a.exIdx}
        sets={session.sets}
        onClose={() => setMenuOpen(true)}
        onList={() => setListOpen(true)}
      />
      <AnimatePresence mode="wait" initial={false}>
        {a.phase === 'rest' ? (
          <RestView key="rest" ex={ex} />
        ) : (
          <LogView key={'log-' + ex.id} ex={ex} onFinish={finish} />
        )}
      </AnimatePresence>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Exercises">
        <ExerciseList
          onPick={(i) => {
            goToExercise(i);
            setListOpen(false);
          }}
          onAdd={(id) => {
            addExerciseToSession(id);
            setListOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="End workout?">
        <div className="stack">
          <button className="btn-primary" onClick={finish}>
            <Check size={20} /> Finish & save
          </button>
          {session.sets.length > 0 && (
            <button className="btn-ghost" onClick={() => (undoLastSet(), setMenuOpen(false))}>
              <Undo2 size={18} /> Undo last set
            </button>
          )}
          <button
            className="btn-ghost danger"
            onClick={() => {
              if (session.sets.length === 0 || confirm('Discard this workout? Logged sets will be deleted.')) {
                cancelRestAlarm();
                discardSession();
                onFinished(null);
              }
            }}
          >
            <X size={18} /> Discard workout
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/* ---------- top bar ---------- */

function TopBar(p: {
  title: string;
  start: number;
  order: string[];
  exIdx: number;
  sets: SetLog[];
  onClose: () => void;
  onList: () => void;
}) {
  const s = getState();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="s-top">
      <div className="s-top-row">
        <button className="icon-btn" onClick={p.onClose} aria-label="End workout">
          <X size={20} />
        </button>
        <div className="s-top-title">
          <span>{p.title}</span>
          <em className="tnum">{mmss((now - p.start) / 1000)}</em>
        </div>
        <button className="icon-btn" onClick={p.onList} aria-label="Exercise list">
          <List size={20} />
        </button>
      </div>
      <div className="segs">
        {p.order.map((id, i) => {
          const ex = s.exercises[id];
          const n = p.sets.filter((x) => x.exId === id).length;
          const f = ex ? Math.min(1, n / ex.sets) : 0;
          return (
            <div key={id} className={`seg ${i === p.exIdx ? 'cur' : ''}`}>
              <motion.i initial={false} animate={{ scaleX: f }} transition={spring} />
            </div>
          );
        })}
      </div>
    </header>
  );
}

/* ---------- logging a set ---------- */

function LogView({ ex, onFinish }: { ex: Exercise; onFinish: () => void }) {
  const s = useStore((x) => x);
  const a = s.active!;
  const session = s.sessions.find((x) => x.id === a.sessionId)!;
  const mine = session.sets.filter((x) => x.exId === ex.id);
  const last = useMemo(() => lastSets(getState(), ex.id, session.id), [ex.id, session.id]);
  const goal = useMemo(() => target(ex, last?.sets), [ex, last]);
  const [vals, setVals] = useState(() => prefill(ex, session.sets, last?.sets));
  const [justLogged, setJustLogged] = useState(false);
  const [pr, setPr] = useState(false);
  const setNo = mine.length + (justLogged ? 0 : 1);
  const ref = last?.sets[Math.min(setNo - 1, last.sets.length - 1)];
  const isLastEx = a.exIdx >= a.order.length - 1;
  const doneTarget = mine.length >= ex.sets;

  const [cam, setCam] = useState(false);
  const [demo, setDemo] = useState<Recording | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  useEffect(() => {
    let on = true;
    listGhosts(ex.id).then((l) => on && setDemo(l.find((r) => r.reps.length >= 1) ?? null));
    return () => {
      on = false;
    };
  }, [ex.id, cam]);

  const logWith = (w: number, r: number) => {
    unlockAudio();
    const best = bestE1rm(getState(), ex.id);
    const sessionBest = Math.max(0, ...mine.map((x) => e1rm(x.w, x.r)));
    const cur = e1rm(w, r);
    setPr(best > 0 && cur > best && cur > sessionBest);
    logSet({ exId: ex.id, w, r });
    thump();
    setJustLogged(true);
  };
  const log = () => logWith(vals.w, vals.r);

  const another = () => {
    setJustLogged(false);
    setPr(false);
    startRest(ex.rest);
  };
  const next = () => {
    if (isLastEx) return onFinish();
    setJustLogged(false);
    goToExercise(a.exIdx + 1);
    startRest(ex.rest);
  };

  return (
    <motion.section
      className="log"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={spring}
    >
      <div className="ex-head">
        <span className="eyebrow">
          {ex.muscle} · {ex.repMin}–{ex.repMax} reps
        </span>
        <h1 className="ex-name">{ex.name}</h1>
        <div className="set-dots">
          {Array.from({ length: Math.max(ex.sets, mine.length + (justLogged ? 0 : 1)) }).map((_, i) => (
            <span key={i} className={`dot ${i < mine.length ? 'on' : ''} ${i === mine.length && !justLogged ? 'now' : ''}`}>
              {i < mine.length ? (
                <>
                  {fmtW(mine[i].w)}
                  <small>×{mine[i].r}</small>
                </>
              ) : (
                <>Set {i + 1}</>
              )}
            </span>
          ))}
        </div>
      </div>

      {ex.notes && <p className="ex-notes">{ex.notes}</p>}

      <div className="last-row">
        {last ? (
          <>
            <span className="muted">Last · {ago(last.at)}</span>
            <span className="tnum last-sets">
              {last.sets.map((x, i) => (
                <b key={i} className={i === setNo - 1 ? 'hl' : ''}>
                  {fmtW(x.w)}×{x.r}
                </b>
              ))}
            </span>
          </>
        ) : (
          <span className="muted">First time — set your baseline</span>
        )}
      </div>

      {goal && mine.length === 0 && !justLogged && (
        <button className="goal" onClick={() => (thump(), setVals({ w: goal.w, r: goal.r }))}>
          <span className="goal-tag">Beat it</span>
          <span className="tnum">
            {fmtW(goal.w)} kg × {goal.r}
          </span>
          <em>{goal.why}</em>
        </button>
      )}

      <div className="controls">
        <Scrubber
          label="Weight"
          unit="kg"
          value={vals.w}
          step={ex.step}
          max={500}
          delta={ref ? vals.w - ref.w : null}
          onChange={(w) => setVals((v) => ({ ...v, w }))}
        />
        <Scrubber
          label="Reps"
          value={vals.r}
          step={1}
          min={0}
          max={100}
          delta={ref && vals.w === ref.w ? vals.r - ref.r : null}
          onChange={(r) => setVals((v) => ({ ...v, r }))}
        />
      </div>

      {!justLogged && (
        <div className={`ghost-row ${demo ? '' : 'solo'}`}>
          {demo && (
            <button className="demo-card" onClick={() => setDemoOpen(true)} aria-label="Show your form">
              <Figure rec={demo} size={112} />
              <span className="eyebrow">Your form</span>
            </button>
          )}
          <button className="ghost-cta" onClick={() => (unlockAudio(), setCam(true))}>
            <span className="ghost-cta-icon">
              <Camera size={20} />
            </span>
            <span className="row-main">
              <b>Ghost Set</b>
              <small className="muted">{demo ? 'Race last time’s you — reps counted for you' : 'Camera counts reps & saves your form'}</small>
            </span>
            <ChevronRight size={18} className="muted" />
          </button>
        </div>
      )}

      <Sheet open={demoOpen && !!demo} onClose={() => setDemoOpen(false)} title="Your form">
        {demo && (
          <div className="stack">
            <div className="demo-big">
              <Figure rec={demo} size={300} />
            </div>
            <p className="muted small">
              Recorded from your own Ghost Set on {new Date(demo.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ·{' '}
              {fmtW(demo.weight)} kg × {demo.reps.length}. Only body points are stored, never video.
            </p>
          </div>
        )}
      </Sheet>

      <AnimatePresence>
        {cam && (
          <GhostCam
            ex={ex}
            weight={vals.w}
            sessionId={session.id}
            onClose={() => setCam(false)}
            onLog={(r) => {
              setCam(false);
              setVals((v) => ({ ...v, r }));
              logWith(vals.w, r);
            }}
          />
        )}
      </AnimatePresence>

      <div className="cta-zone">
        <AnimatePresence mode="wait" initial={false}>
          {!justLogged ? (
            <motion.button
              key="log"
              className="btn-primary big"
              onClick={log}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={spring}
              whileTap={{ scale: 0.97 }}
            >
              <Check size={24} strokeWidth={2.6} /> Log set {setNo}
            </motion.button>
          ) : (
            <motion.div
              key="choice"
              className="choice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={spring}
            >
              {pr && (
                <motion.div className="pr-flash" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: 0.05 }}>
                  New best · {fmtW(vals.w)} × {vals.r}
                </motion.div>
              )}
              {!doneTarget ? (
                <>
                  <button className="btn-primary big" onClick={another}>
                    <RotateCcw size={22} /> Another set <span className="pill-time">{mmss(ex.rest)}</span>
                  </button>
                  <button className="btn-ghost" onClick={next}>
                    {isLastEx ? 'Finish workout' : 'Next exercise'} <ChevronRight size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-primary big" onClick={next}>
                    {isLastEx ? (
                      <>
                        <Check size={22} /> Finish workout
                      </>
                    ) : (
                      <>
                        Next exercise <ChevronRight size={22} />
                      </>
                    )}
                  </button>
                  <button className="btn-ghost" onClick={another}>
                    <Plus size={18} /> One more set · rest {mmss(ex.rest)}
                  </button>
                </>
              )}
              <button className="link-btn" onClick={() => (undoLastSet(), setJustLogged(false), setPr(false))}>
                <Undo2 size={15} /> Undo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

/* ---------- rest timer ---------- */

const R = 132;
const C = 2 * Math.PI * R;

function RestView({ ex }: { ex: Exercise }) {
  const a = useStore((x) => x.active)!;
  const sessions = useStore((x) => x.sessions);
  const session = sessions.find((x) => x.id === a.sessionId)!;
  const [left, setLeft] = useState(() => (a.restEndsAt - Date.now()) / 1000);
  const warned = useRef(false);
  const fired = useRef(false);
  const mineCount = session.sets.filter((x) => x.exId === ex.id).length;
  const up = prefill(ex, session.sets, lastSets(getState(), ex.id, session.id)?.sets);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const l = (a.restEndsAt - Date.now()) / 1000;
      setLeft(l);
      if (l > 10.5) warned.current = false;
      if (l <= 10 && l > 0 && !warned.current && a.restTotal > 20) {
        warned.current = true;
        if (!document.hidden) {
          chimeWarn();
          buzzWarn();
        }
      }
      if (l <= 0 && !fired.current) {
        fired.current = true;
        const late = -l > 8; // came back long after it ended: no fanfare
        if (!late && !document.hidden) {
          chimeDone();
          buzzDone();
        } else if (document.hidden) webNotify('Rest over — next set', `${ex.name} — you're up`);
        endRest();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [a.restEndsAt, a.restTotal, ex.name]);

  const frac = Math.max(0, Math.min(1, left / a.restTotal));
  const hot = left <= 10;

  return (
    <motion.section
      className={`rest ${hot ? 'hot' : ''}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={spring}
    >
      <span className="eyebrow">Rest</span>
      <div className="ring">
        <div className="ring-glow" style={{ opacity: 0.35 + 0.65 * (1 - frac) }} />
        <svg viewBox="0 0 300 300">
          <defs>
            <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--accent-2)" />
              <stop offset="1" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          <circle cx="150" cy="150" r={R} className="ring-track" />
          {Array.from({ length: 60 }).map((_, i) => (
            <line
              key={i}
              x1="150"
              y1="6"
              x2="150"
              y2={i % 5 ? 11 : 15}
              className={`ring-tick ${i / 60 < 1 - frac ? 'past' : ''}`}
              transform={`rotate(${i * 6} 150 150)`}
            />
          ))}
          <circle
            cx="150"
            cy="150"
            r={R}
            className="ring-bar"
            stroke="url(#rg)"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 150 150)"
          />
        </svg>
        <div className="ring-center">
          <motion.div className="ring-time tnum" animate={hot ? { scale: [1, 1.05, 1] } : { scale: 1 }} transition={hot ? { duration: 1, repeat: Infinity } : {}}>
            {mmss(left)}
          </motion.div>
          <span className="muted">of {mmss(a.restTotal)}</span>
        </div>
      </div>

      <div className="rest-adjust">
        <button className="chip-btn" onClick={() => (thump(), adjustRest(-15))}>
          −15s
        </button>
        <button className="chip-btn" onClick={() => (thump(), adjustRest(15))}>
          +15s
        </button>
        <button className="chip-btn" onClick={() => (thump(), adjustRest(60))}>
          +1 min
        </button>
      </div>

      <div className="upnext">
        <div>
          <span className="eyebrow">Up next · Set {mineCount + 1}</span>
          <strong>{ex.name}</strong>
          <span className="tnum muted">
            {fmtW(up.w)} kg × {up.r}
          </span>
        </div>
        <button className="btn-primary" onClick={() => (cancelRestAlarm(), endRest())}>
          <SkipForward size={18} /> Go now
        </button>
      </div>
    </motion.section>
  );
}

/* ---------- exercise list during a session ---------- */

function ExerciseList({ onPick, onAdd }: { onPick: (i: number) => void; onAdd: (id: string) => void }) {
  const s = getState();
  const a = s.active!;
  const session = s.sessions.find((x) => x.id === a.sessionId)!;
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack">
      {a.order.map((id, i) => {
        const ex = s.exercises[id];
        if (!ex) return null;
        const n = session.sets.filter((x) => x.exId === id).length;
        return (
          <button key={id} className={`row ${i === a.exIdx ? 'row-cur' : ''}`} onClick={() => onPick(i)}>
            <span className={`row-check ${n >= ex.sets ? 'done' : ''}`}>{n >= ex.sets ? <Check size={14} /> : i + 1}</span>
            <span className="row-main">
              <b>{ex.name}</b>
              <small className="muted">
                {n}/{ex.sets} sets
              </small>
            </span>
            <ChevronRight size={18} className="muted" />
          </button>
        );
      })}
      {!adding ? (
        <button className="btn-ghost" onClick={() => setAdding(true)}>
          <Plus size={18} /> Add an exercise
        </button>
      ) : (
        <div className="stack tight">
          <span className="eyebrow">Add after the current exercise</span>
          <ExercisePicker exclude={a.order} onPick={onAdd} />
        </div>
      )}
    </div>
  );
}
