import { ArrowLeftRight, BellOff, Camera, Check, ChevronRight, List, Minus, Plus, RotateCcw, SkipForward, Undo2, X } from 'lucide-react';
import { profileFor } from '../lib/pose';
import { ExercisePicker } from './ExercisePicker';
import { GhostCam } from './GhostCam';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  alarmPulse,
  buzzWarn,
  cancelRestAlarm,
  chimeWarn,
  scheduleRestAlarm,
  stayAwake,
  thump,
  unlockAudio,
  webNotify,
} from '../lib/native';
import { fromShow, kindOf, loadText, setMark, shortLoad, stepShow, toShow, unitLabel, unitOf } from '../lib/load';
import { ago, e1rm, lastSets, mmss, prefill, target, bestE1rm } from '../lib/progress';
import {
  addExerciseToSession,
  adjustRest,
  discardSession,
  endRest,
  finishSession,
  getState,
  goToExercise,
  logSet,
  nextPendingIdx,
  saveExercise,
  startRest,
  swapToExercise,
  undoLastSet,
  useStore,
} from '../lib/store';
import type { Exercise, LoadKind, SetLog } from '../lib/types';
import { preloadVoice } from '../lib/voice';
import { Scrubber } from './Scrubber';
import { SetChips, SetEditSheet, type EditTarget } from './SetEdit';
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
  const openSwap = () => setListOpen(true);

  // warm up the voice listener in the background so Ghost Set opens ready
  useEffect(() => {
    if (getState().settings.voice === false) return;
    const t = setTimeout(() => preloadVoice().catch(() => {}), 2500);
    return () => clearTimeout(t);
  }, []);

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
          <RestView key="rest" ex={ex} onSwap={openSwap} />
        ) : (
          <LogView key={'log-' + ex.id} ex={ex} onFinish={finish} onSwap={openSwap} />
        )}
      </AnimatePresence>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="What's next?">
        <ExerciseList
          onPick={(i) => {
            swapToExercise(i);
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

function LogView({ ex, onFinish, onSwap }: { ex: Exercise; onFinish: () => void; onSwap: () => void }) {
  const s = useStore((x) => x);
  const a = s.active!;
  const session = s.sessions.find((x) => x.id === a.sessionId)!;
  const mine = session.sets.filter((x) => x.exId === ex.id);
  const kind = kindOf(ex);
  const last = useMemo(() => lastSets(getState(), ex.id, session.id), [ex.id, session.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const goal = useMemo(() => target(ex, last?.sets), [ex, last]);
  const [vals, setVals] = useState(() => prefill(ex, session.sets, last?.sets));
  const [justLogged, setJustLogged] = useState(false);
  const [pr, setPr] = useState(false);
  const setNo = mine.length + (justLogged ? 0 : 1);
  const ref = last?.sets[Math.min(setNo - 1, last.sets.length - 1)];
  const nextIdx = nextPendingIdx();
  const isLastEx = nextIdx < 0;
  const nextEx = isLastEx ? null : s.exercises[a.order[nextIdx]];
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const doneTarget = mine.length >= ex.sets;

  const [cam, setCam] = useState(false);
  const trackable = profileFor(ex).track;

  const logWith = (w: number, r: number) => {
    unlockAudio();
    const best = bestE1rm(getState(), ex.id);
    const sessionBest = Math.max(0, ...mine.map((x) => e1rm(x.w, x.r)));
    const cur = e1rm(w, r);
    setPr(best > 0 && cur > best && cur > sessionBest);
    logSet({ exId: ex.id, w, r, u: setMark(ex) });
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
    goToExercise(nextIdx);
    startRest(ex.rest);
  };

  const setKind = (load: LoadKind) => {
    thump();
    const updated = { ...ex, load };
    saveExercise(updated);
    const w = prefill(updated, session.sets, lastSets(getState(), ex.id, session.id)?.sets).w;
    setVals((v) => ({ ...v, w }));
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
            <button
              key={i}
              disabled={i >= mine.length}
              onClick={() => setEditing({ sessionId: session.id, set: mine[i] })}
              aria-label={i < mine.length ? `Edit set ${i + 1}` : undefined}
              className={`dot ${i < mine.length ? 'on' : ''} ${i === mine.length && !justLogged ? 'now' : ''}`}
            >
              {i < mine.length ? (
                <>
                  {shortLoad(mine[i], ex)}
                  <small>×{mine[i].r}</small>
                </>
              ) : (
                <>Set {i + 1}</>
              )}
            </button>
          ))}
          <span className="sets-adj">
            <button onClick={() => (thump(), saveExercise({ ...ex, sets: Math.max(1, ex.sets - 1) }))} disabled={ex.sets <= 1} aria-label="One set fewer">
              <Minus size={14} />
            </button>
            <button onClick={() => (thump(), saveExercise({ ...ex, sets: ex.sets + 1 }))} aria-label="One set more">
              <Plus size={14} />
            </button>
          </span>
        </div>
        {mine.length === 0 && !justLogged && a.order.length > 1 && (
          <button className="swap-btn" onClick={onSwap}>
            <ArrowLeftRight size={15} /> Machine taken? Do something else
          </button>
        )}
      </div>

      {ex.notes && <p className="ex-notes">{ex.notes}</p>}

      <div className="last-row">
        {last ? (
          <>
            <span className="muted">Last · {ago(last.at)}</span>
            <span className="tnum last-sets">
              {last.sets.map((x, i) => (
                <b key={i} className={i === setNo - 1 ? 'hl' : ''}>
                  {shortLoad(x, ex)}×{x.r}
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
            {loadText(goal.w, ex)} × {goal.r}
          </span>
          <em>{goal.why}</em>
        </button>
      )}

      <div className="load-row">
        <div className="seg-ctl">
          {(
            [
              ['weight', 'Weight'],
              ['bar', 'Bar +'],
              ['holes', 'Holes'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => kind !== k && setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        {kind !== 'holes' && (
          <div className="seg-ctl">
            {(['kg', 'lb'] as const).map((u) => (
              <button key={u} className={unitOf(ex) === u ? 'on' : ''} onClick={() => (thump(), saveExercise({ ...ex, unit: u }))}>
                {u}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="controls">
        <Scrubber
          label={kind === 'holes' ? 'Holes' : kind === 'bar' ? 'Plates on the bar' : 'Weight'}
          unit={unitLabel(ex)}
          value={toShow(vals.w, ex)}
          step={stepShow(ex)}
          max={kind === 'holes' ? 60 : 1100}
          delta={ref ? +(toShow(vals.w, ex) - toShow(ref.w, ex)).toFixed(1) : null}
          onChange={(v) => setVals((x) => ({ ...x, w: fromShow(v, ex) }))}
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
        <div className="ghost-row solo">
          <button className="ghost-cta" onClick={() => (unlockAudio(), setCam(true))} disabled={!trackable}>
            <span className="ghost-cta-icon">
              <Camera size={20} />
            </span>
            <span className="row-main">
              <b>Ghost Set</b>
              <small className="muted">
                {!trackable ? 'Not available for holds & small movements' : 'Camera counts your reps and rates the set'}
              </small>
            </span>
            <ChevronRight size={18} className="muted" />
          </button>
        </div>
      )}

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
                  New best · {loadText(vals.w, ex)} × {vals.r}
                </motion.div>
              )}
              {!doneTarget ? (
                <>
                  <button className="btn-primary big" onClick={another}>
                    <RotateCcw size={22} /> Another set <span className="pill-time">{mmss(ex.rest)}</span>
                  </button>
                  <button className="btn-ghost" onClick={next}>
                    {isLastEx ? 'Finish workout' : `Next: ${nextEx?.name}`} <ChevronRight size={18} />
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
                        <span className="cta-name">Next: {nextEx?.name}</span> <ChevronRight size={22} />
                      </>
                    )}
                  </button>
                  <button className="btn-ghost" onClick={another}>
                    <Plus size={18} /> One more set · rest {mmss(ex.rest)}
                  </button>
                </>
              )}
              <div className="choice-links">
                {!isLastEx && (
                  <button className="link-btn" onClick={onSwap}>
                    <ArrowLeftRight size={15} /> Pick another
                  </button>
                )}
                <button className="link-btn" onClick={() => setEditing({ sessionId: session.id, set: mine[mine.length - 1] })}>
                  Edit set
                </button>
                <button className="link-btn" onClick={() => (undoLastSet(), setJustLogged(false), setPr(false))}>
                  <Undo2 size={15} /> Undo
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <SetEditSheet edit={editing} onClose={() => setEditing(null)} onDeleted={() => (setJustLogged(false), setPr(false))} />
    </motion.section>
  );
}

/* ---------- rest timer ---------- */

const R = 132;
const C = 2 * Math.PI * R;

function RestView({ ex, onSwap }: { ex: Exercise; onSwap: () => void }) {
  const a = useStore((x) => x.active)!;
  const sessions = useStore((x) => x.sessions);
  const session = sessions.find((x) => x.id === a.sessionId)!;
  const [left, setLeft] = useState(() => (a.restEndsAt - Date.now()) / 1000);
  const warned = useRef(false);
  const fired = useRef(false);
  const [ringing, setRinging] = useState(false);
  const mineCount = session.sets.filter((x) => x.exId === ex.id).length;
  const up = prefill(ex, session.sets, lastSets(getState(), ex.id, session.id)?.sets);

  useEffect(() => {
    let raf = 0;
    fired.current = false;
    setRinging(false);
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
        if (-l > 180) {
          endRest(); // came back long after it ended: nothing left to ring for
          return;
        }
        if (document.hidden) webNotify('Rest over — next set', `${ex.name} — you're up`);
        setLeft(0);
        setRinging(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [a.restEndsAt, a.restTotal, ex.name]);

  // keeps ringing until you press Stop (gives up after 3 minutes so it can't ring forever)
  useEffect(() => {
    if (!ringing) return;
    const started = Date.now();
    const beat = () => {
      if (!document.hidden && Date.now() - started < 180000) alarmPulse();
    };
    beat();
    const t = setInterval(beat, 1600);
    return () => clearInterval(t);
  }, [ringing]);

  const stop = () => {
    thump();
    cancelRestAlarm();
    endRest();
  };

  if (ringing)
    return (
      <motion.section className="alarm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="alarm-pulse" animate={{ scale: [1, 1.5], opacity: [0.55, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
        <span className="eyebrow accent">Rest over</span>
        <h1 className="alarm-title">Time to lift</h1>
        <p className="muted">
          Set {mineCount + 1} · {ex.name}
        </p>
        <button className="btn-primary big alarm-stop" onClick={stop}>
          <BellOff size={24} /> Stop
        </button>
        <button className="chip-btn" onClick={() => (thump(), cancelRestAlarm(), startRest(30))}>
          30 more seconds
        </button>
      </motion.section>
    );

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
            {loadText(up.w, ex)} × {up.r}
          </span>
          <button className="swap-btn" onClick={onSwap}>
            <ArrowLeftRight size={15} /> Change exercise
          </button>
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
      <p className="muted small">Tap one to do it now. Anything you skip comes back at the end.</p>
      {a.order.map((id, i) => {
        const ex = s.exercises[id];
        if (!ex) return null;
        const mine = session.sets.filter((x) => x.exId === id);
        const n = mine.length;
        return (
          <div key={id} className="swap-item">
            <button className={`row ${i === a.exIdx ? 'row-cur' : ''}`} onClick={() => onPick(i)}>
              <span className={`row-check ${n >= ex.sets ? 'done' : ''}`}>{n >= ex.sets ? <Check size={14} /> : i + 1}</span>
              <span className="row-main">
                <b>{ex.name}</b>
                <small className="muted">
                  {i === a.exIdx ? 'Doing now · ' : ''}
                  {n}/{ex.sets} sets
                </small>
              </span>
              <ChevronRight size={18} className="muted" />
            </button>
            {n > 0 && <SetChips sessionId={session.id} sets={mine} ex={ex} />}
          </div>
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
