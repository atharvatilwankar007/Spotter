import { Check, ChevronDown, Minus, Plus, RefreshCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { latestGhost, saveGhost } from '../lib/ghostdb';
import { chimeRep, thump, tick, unlockAudio } from '../lib/native';
import {
  analyse,
  betterSide,
  BONES,
  checkSetup,
  frameFromResult,
  HEAD,
  loadPose,
  profileFor,
  RepCounter,
  SIGNAL_LABEL,
  type Analysis,
  type Frame,
  type Recording,
  type SetupCheck,
} from '../lib/pose';
import { fmtW } from '../lib/progress';
import { BestWorst, RepStrip, ScoreParts, SetScore, type Still } from './SetReview';
import { rateSet } from '../lib/rating';
import { lastSets } from '../lib/progress';
import { getState, uid } from '../lib/store';
import type { Exercise } from '../lib/types';

type Phase = 'loading' | 'setup' | 'tracking' | 'summary' | 'error';
const spring = { type: 'spring', stiffness: 380, damping: 32 } as const;

interface Props {
  ex: Exercise;
  weight: number;
  sessionId: string;
  onClose: () => void;
  onLog: (reps: number) => void;
}

export function GhostCam({ ex, weight, sessionId, onClose, onLog }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [reps, setReps] = useState(0);
  const [ghostReps, setGhostReps] = useState<number | null>(null);
  const [bars, setBars] = useState<number[]>([]);
  const prof = profileFor(ex);
  const [checks, setChecks] = useState<SetupCheck | null>(null);
  const [armed, setArmed] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const skipRef = useRef(false);
  const [logReps, setLogReps] = useState(0);
  const [detail, setDetail] = useState(false);
  const [result, setResult] = useState<{ rec: Recording; a: Analysis; stills: (Still | null)[] } | null>(null);
  const ghost = useRef<Recording | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const finishRef = useRef<() => void>(() => {});
  // 1 = whole camera frame visible (most zoomed out). Larger = closer.
  const zoomRef = useRef(1);
  const [zoom, setZoomState] = useState(1);
  const maxZoomRef = useRef(3);
  const setZoom = (z: number) => {
    const c = Math.min(maxZoomRef.current, Math.max(1, Math.round(z * 20) / 20));
    zoomRef.current = c;
    setZoomState(c);
  };
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    unlockAudio();
    latestGhost(ex.id, sessionId).then((g) => {
      ghost.current = g;
      if (g) setGhostReps(0);
    });
  }, [ex.id, sessionId]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let dead = false;
    let counter: RepCounter | null = null;
    let ar = 4 / 3;
    let okSince = 0;
    let setupStart = 0;
    let lastChecks = '';
    let lastT = 0;
    const frames: Frame[] = [];
    let t0 = 0;
    let lastRec = -1;
    let lastTs = 0;
    let anchorLive: { x: number; y: number; s: number } | null = null;
    // deepest moment of each rep, kept in memory only for the summary (never saved)
    const stills: (Still | null)[] = [];
    let cand: { cv: HTMLCanvasElement; frame: Frame; prog: number } | null = null;
    let armStill: Still | null = null; // if you lock on at the far end, this is that first rep's deepest moment

    const finish = () => {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      if (counter && counter.flush(counter.value != null ? lastT : 0)) stills.push(cand ? { url: cand.cv.toDataURL('image/jpeg', 0.8), frame: cand.frame, w: cand.cv.width, h: cand.cv.height } : null);
      const rec: Recording = {
        id: uid(),
        exId: ex.id,
        sessionId,
        at: Date.now(),
        weight,
        signal: prof.signal,
        reps: counter?.reps ?? [],
        frames: frames.filter((f) => f.t >= Math.max(0, (counter?.firstRepStart ?? 0) - 1.2)),
        ar,
        side: counter?.side,
      };
      // re-base time so the recording starts just before the first rep
      const shift = rec.frames[0]?.t ?? 0;
      rec.frames = rec.frames.map((f) => ({ ...f, t: Math.round((f.t - shift) * 1000) / 1000 }));
      rec.reps = rec.reps.map((r) => ({ ...r, t0: r.t0 - shift, t1: r.t1 - shift }));
      // dev only: pretend later reps were shallower, to preview the grading + overlay
      if (import.meta.env.DEV && location.search.includes('testshallow')) rec.reps = rec.reps.map((r, i) => ({ ...r, rom: r.rom * (i >= 3 ? 0.82 - (i - 3) * 0.05 : 1) }));
      const a = analyse(rec, ghost.current);
      setLogReps(a.reps);
      setResult({ rec, a, stills: stills.map((x) => x) });
      setPhase('summary');
    };
    finishRef.current = finish;
    stopRef.current = () => {
      dead = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      try {
        // dev only: ?testvideo=<url> feeds a video file instead of the camera
        const testVideo = import.meta.env.DEV ? new URLSearchParams(location.search).get('testvideo') : null;
        const v = video.current!;
        if (testVideo) {
          const lm0 = await loadPose();
          v.src = testVideo;
          await new Promise((r) => (v.onloadeddata = r));
          lastTs = performance.now() + 1e6;
          return startLoop(lm0, v, true);
        }
        const [lm, s] = await Promise.all([
          loadPose(),
          navigator.mediaDevices.getUserMedia({
            // 4:3 = the sensor's full field of view (portrait sizes make phones crop = zoomed in)
            video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 }, frameRate: { ideal: 30 } },
            audio: false,
          }),
        ]);
        if (dead) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        // if the camera has optical/digital zoom, start at its widest
        try {
          const track = s.getVideoTracks()[0];
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number } };
          if (caps?.zoom) await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] });
        } catch {
          /* no zoom control */
        }
        v.srcObject = s;
        await v.play();
        startLoop(lm, v);
      } catch (e) {
        const m = String((e as Error)?.name || e);
        setErr(
          /NotAllowed|Permission/i.test(m)
            ? 'Camera permission was denied. Allow it in your phone settings for Spotter, then try again.'
            : /NotFound|Overconstrained/i.test(m)
              ? 'No camera found.'
              : 'Could not start pose tracking on this device.',
        );
        setPhase('error');
      }
    })();

    function startLoop(lm: Awaited<ReturnType<typeof loadPose>>, v: HTMLVideoElement, step = false) {
      {
        setPhase('setup');
        t0 = performance.now();
        ar = v.videoWidth / v.videoHeight || 4 / 3;

        const loop = () => {
          if (dead) return;
          raf = requestAnimationFrame(loop);
          if (v.readyState < 2) return;
          let ts = performance.now();
          if (ts <= lastTs) ts = lastTs + 1;
          lastTs = ts;
          processFrame(ts, (ts - t0) / 1000);
        };
        const processFrame = (ts: number, t: number) => {
          const res = lm.detectForVideo(v, ts);
          const c = canvas.current!;
          const ctx = c.getContext('2d')!;
          const W = c.clientWidth;
          const Hh = c.clientHeight;
          const dpr = Math.min(2, devicePixelRatio || 1);
          if (c.width !== W * dpr) {
            c.width = W * dpr;
            c.height = Hh * dpr;
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, W, Hh);
          // zoom 1 = whole frame fits the screen; the <video> is sized to match exactly
          const fit = Math.min(W / v.videoWidth, Hh / v.videoHeight);
          maxZoomRef.current = Math.max(2, (Math.max(W / v.videoWidth, Hh / v.videoHeight) / fit) * 2);
          const sc = fit * zoomRef.current;
          const ox = (W - v.videoWidth * sc) / 2;
          const oy = (Hh - v.videoHeight * sc) / 2;
          v.style.width = v.videoWidth * sc + 'px';
          v.style.height = v.videoHeight * sc + 'px';
          const map = (x: number, y: number): [number, number] => [ox + x * v.videoWidth * sc, oy + y * v.videoHeight * sc];

          if (!res.landmarks?.[0] || !res.worldLandmarks?.[0]) {
            okSince = 0;
            return;
          }
          const f = frameFromResult(res.landmarks[0], res.worldLandmarks[0], t);
          lastT = t;

          if (!counter) {
            // guided setup: right angle, whole body visible, right distance — then counting can start
            setupStart ||= t;
            if (t - setupStart > 6) setCanSkip(true);
            const chk = checkSetup(f, prof, ar);
            const key = JSON.stringify(chk);
            if (key !== lastChecks) {
              lastChecks = key;
              setChecks(chk);
            }
            const good = chk.visible && chk.distance === 'ok' && chk.view === 'ok';
            if (good || skipRef.current) {
              okSince ||= t;
              if (t - okSince > 0.8 || skipRef.current) {
                counter = new RepCounter(prof, betterSide(f, prof.signal), ar);
                if (import.meta.env.DEV) (window as unknown as { __counter: RepCounter }).__counter = counter;
                setPhase('tracking');
                thump();
              }
            } else okSince = 0;
            drawSkeleton(ctx, f.p, map, good ? 'rgba(183,243,107,0.9)' : 'rgba(243,239,231,0.55)', 3, f.vis);
            return;
          }

          if (t - lastRec >= 1 / 15) {
            frames.push(f);
            lastRec = t;
          }
          const rep = counter.push(t, f);
          if (counter.armed) setArmed(true);
          const snap = (prev?: HTMLCanvasElement) => {
            const cv = prev ?? document.createElement('canvas');
            cv.width = 360;
            cv.height = Math.round((360 * v.videoHeight) / v.videoWidth);
            cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
            return cv;
          };
          if (counter.armed && !armStill) {
            const cv = snap();
            armStill = { url: cv.toDataURL('image/jpeg', 0.8), frame: f, w: cv.width, h: cv.height };
          }
          // a twitch that never became a rep shouldn't leave its photo behind
          if (!rep && cand && counter.depth < counter.captureFrom * 0.4) cand = null;
          if (counter.depth > Math.max(counter.captureFrom, cand?.prog ?? 0)) cand = { cv: snap(cand?.cv), frame: f, prog: counter.depth };
          if (rep) {
            stills.push(cand ? { url: cand.cv.toDataURL('image/jpeg', 0.8), frame: cand.frame, w: cand.cv.width, h: cand.cv.height } : counter.reps.length === 1 ? armStill : null);
            cand = null;
          }
          if (rep) {
            chimeRep(counter.reps.length);
            thump();
            setReps(counter.reps.length);
            setBars(counter.reps.map((r) => r.dur));
          }

          // where the live body is (to place the ghost)
          const hipX = (f.p[7 * 2] + f.p[8 * 2]) / 2;
          const hipY = (f.p[7 * 2 + 1] + f.p[8 * 2 + 1]) / 2;
          const torso = Math.hypot((f.p[1 * 2] + f.p[2 * 2]) / 2 - hipX, (f.p[1 * 2 + 1] + f.p[2 * 2 + 1]) / 2 - hipY);
          anchorLive ??= { x: hipX, y: hipY, s: torso };

          // ghost: last time's set, time-aligned to your first rep
          const g = ghost.current;
          if (g && counter.firstRepStart != null && g.frames.length) {
            const gStart = g.reps[0]?.t0 ?? 0;
            const gt = t - counter.firstRepStart + gStart;
            const gf = g.frames.find((x) => x.t >= gt) ?? g.frames[g.frames.length - 1];
            const g0 = g.frames[0];
            const gHipX = (g0.p[7 * 2] + g0.p[8 * 2]) / 2;
            const gHipY = (g0.p[7 * 2 + 1] + g0.p[8 * 2 + 1]) / 2;
            const gTorso = Math.hypot((g0.p[1 * 2] + g0.p[2 * 2]) / 2 - gHipX, (g0.p[1 * 2 + 1] + g0.p[2 * 2 + 1]) / 2 - gHipY);
            const k = gTorso > 0.01 ? anchorLive.s / gTorso : 1;
            const pts = gf.p.map((val, i) => (i % 2 ? anchorLive!.y + (val - gHipY) * k : anchorLive!.x + (val - gHipX) * k));
            drawSkeleton(ctx, pts, map, 'rgba(255,106,43,0.42)', 7, gf.vis, true);
            setGhostReps(g.reps.filter((r) => r.t1 <= gt).length);
          }
          drawSkeleton(ctx, f.p, map, 'rgba(243,239,231,0.95)', 4, f.vis);

          // auto-finish: a few reps done and you've been still for 4 seconds
          if (counter.reps.length >= 1 && t - Math.max(counter.lastMoveT, counter.reps[counter.reps.length - 1].t1) > 4) finish();
        };
        if (!step) {
          raf = requestAnimationFrame(loop);
          return;
        }
        // dev test mode: step through the video file frame by frame at 15 fps (independent of tab throttling)
        (async () => {
          v.pause();
          for (let i = 0; !dead && i < 15 * 30; i++) {
            v.currentTime = (i / 15) % v.duration;
            await new Promise((r) => (v.onseeked = r));
            lastTs += 67;
            processFrame(lastTs, i / 15);
          }
        })();
      }
    }

    return () => stopRef.current();
  }, [facing]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    stopRef.current();
    onClose();
  };

  const maxBar = Math.max(...bars, 0.001);
  const rating = useMemo(
    () =>
      result
        ? rateSet({ a: result.a, reps: result.rec.reps, count: logReps, weight, ex, last: lastSets(getState(), ex.id, sessionId)?.sets })
        : null,
    [result, logReps, weight, ex, sessionId],
  );
  const mirrored = facing === 'user';

  return (
    <motion.div
      className="ghost"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // pinch to zoom
      onPointerDown={(e) => {
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.current.size === 2) {
          const [a, b] = [...pts.current.values()];
          pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoomRef.current };
        }
      }}
      onPointerMove={(e) => {
        if (!pts.current.has(e.pointerId)) return;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pts.current.size === 2) {
          const [a, b] = [...pts.current.values()];
          setZoom((pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d);
        }
      }}
      onPointerUp={(e) => {
        pts.current.delete(e.pointerId);
        if (pts.current.size < 2) pinch.current = null;
      }}
      onPointerCancel={(e) => {
        pts.current.delete(e.pointerId);
        pinch.current = null;
      }}
    >
      <div className={`ghost-stage ${mirrored ? 'mirror' : ''}`}>
        <video ref={video} playsInline muted />
        <canvas ref={canvas} />
      </div>
      <div className="ghost-vignette" />

      <header className="ghost-top">
        <button className="icon-btn glass" onClick={close} aria-label="Close camera">
          <X size={20} />
        </button>
        <div className="ghost-title">
          <span>{ex.name}</span>
          <em>
            {fmtW(weight)} kg · tracking {SIGNAL_LABEL[prof.signal]}
          </em>
        </div>
        <button
          className="icon-btn glass"
          onClick={() => {
            setPhase('loading');
            setFacing((f) => (f === 'user' ? 'environment' : 'user'));
          }}
          aria-label="Switch camera"
          disabled={phase === 'summary'}
        >
          <RefreshCcw size={18} />
        </button>
      </header>

      {(phase === 'setup' || phase === 'tracking') && (
        <div className="zoom-ctl">
          <button onClick={() => (tick(), setZoom(zoom + 0.25))} disabled={zoom >= maxZoomRef.current} aria-label="Zoom in">
            <Plus size={18} />
          </button>
          <button className="zoom-val tnum" onClick={() => (tick(), setZoom(1))} aria-label="Fit whole camera view">
            {zoom.toFixed(1)}×
          </button>
          <button onClick={() => (tick(), setZoom(zoom - 0.25))} disabled={zoom <= 1} aria-label="Zoom out">
            <Minus size={18} />
          </button>
        </div>
      )}

      {phase === 'loading' && <div className="ghost-msg">Waking up the spotter…</div>}
      {phase === 'setup' && <SetupPanel prof={prof} checks={checks} canSkip={canSkip} onSkip={() => (skipRef.current = true)} />}
      {phase === 'tracking' && !armed && (
        <div className="ghost-hint">
          <b>Get into your start position</b>
          <span>Hold still for a second — counting starts automatically</span>
        </div>
      )}
      {phase === 'error' && (
        <div className="ghost-msg">
          <b>Camera unavailable</b>
          <span>{err}</span>
        </div>
      )}

      {phase === 'tracking' && (
        <>
          <div className="race">
            <div className="race-you">
              <motion.b key={reps} initial={{ scale: 1.4, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={spring} className="tnum">
                {reps}
              </motion.b>
              <span>reps</span>
            </div>
            {ghostReps != null && (
              <div className="race-ghost">
                <b className="tnum">{ghostReps}</b>
                <span>ghost · {fmtW(ghost.current?.weight ?? 0)} kg</span>
              </div>
            )}
          </div>
          <div className="ghost-bottom">
            <div className="rep-bars">
              {bars.map((d, i) => (
                <motion.i key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} style={{ height: `${Math.max(14, (d / maxBar) * 100)}%` }} transition={spring} />
              ))}
            </div>
            <button className="btn-primary big" onClick={() => finishRef.current()}>
              <Check size={22} /> Done
            </button>
          </div>
        </>
      )}

      <AnimatePresence>
        {phase === 'summary' && result && (
          <motion.div className="ghost-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} transition={spring}>
            <SetScore rating={rating!} reps={logReps} />
            <button className="detail-toggle" onClick={() => (tick(), setDetail(!detail))} aria-expanded={detail}>
              Detailed review <ChevronDown size={16} className={detail ? 'flip' : ''} />
            </button>
            <AnimatePresence initial={false}>
              {detail && (
                <motion.div
                  className="detail"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <div className="detail-in">
                    <ScoreParts rating={rating!} />
                    <p className="detail-verdict">{result.a.verdict}</p>
                    {result.a.reps > 0 && <RepStrip a={result.a} />}
                    <BestWorst stills={result.stills} a={result.a} rec={result.rec} mirrored={mirrored} />
                    <div className="ghost-facts tnum">
                      {result.a.vsLine && <span>{result.a.vsLine}</span>}
                      <span>
                        Effort (est.): <b>{result.a.rir}</b>
                      </span>
                    </div>
                    {result.a.tip && <p className="ghost-tip">{result.a.tip}</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="stack">
              <div className="fix-count">
                <span className="muted small">{logReps === result.a.reps ? 'Count looks wrong? Fix it' : `Counted ${result.a.reps}, you set ${logReps}`}</span>
                <div className="fix-btns">
                  <button className="icon-btn" onClick={() => (tick(), setLogReps(Math.max(0, logReps - 1)))} aria-label="One rep fewer">
                    <Minus size={18} />
                  </button>
                  <b className="tnum">{logReps}</b>
                  <button className="icon-btn" onClick={() => (tick(), setLogReps(logReps + 1))} aria-label="One rep more">
                    <Plus size={18} />
                  </button>
                </div>
              </div>
              <button
                className="btn-primary big"
                disabled={logReps === 0}
                onClick={() => {
                  if (result.a.reps > 0) saveGhost(result.rec);
                  onLog(logReps);
                }}
              >
                <Check size={22} /> Log {fmtW(weight)} kg × {logReps}
              </button>
              <button className="btn-ghost" onClick={close}>
                Discard, log by hand
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  p: number[],
  map: (x: number, y: number) => [number, number],
  color: string,
  width: number,
  vis: number[],
  soft = false,
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  if (soft) {
    ctx.shadowColor = 'rgba(255,106,43,0.8)';
    ctx.shadowBlur = 18;
  }
  for (const [a, b] of BONES) {
    if (vis[a] < 0.3 || vis[b] < 0.3) continue;
    const [x1, y1] = map(p[a * 2], p[a * 2 + 1]);
    const [x2, y2] = map(p[b * 2], p[b * 2 + 1]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  if (vis[HEAD] > 0.3) {
    const [hx, hy] = map(p[0], p[1]);
    const [sx, sy] = map((p[2] + p[4]) / 2, (p[3] + p[5]) / 2);
    const r = Math.max(8, Math.hypot(hx - sx, hy - sy) * 0.42);
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    if (soft) ctx.fill();
    else ctx.stroke();
  }
  if (!soft) {
    ctx.fillStyle = '#ff6a2b';
    ctx.shadowColor = 'rgba(255,106,43,0.9)';
    ctx.shadowBlur = 10;
    for (let i = 1; i < vis.length; i++) {
      if (vis[i] < 0.3) continue;
      const [x, y] = map(p[i * 2], p[i * 2 + 1]);
      ctx.beginPath();
      ctx.arc(x, y, width * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

const VIEW_LABEL = { side: 'Side-on', front: 'Facing the phone', angle: '45° angle' } as const;

function SetupPanel({ prof, checks, canSkip, onSkip }: { prof: ReturnType<typeof profileFor>; checks: SetupCheck | null; canSkip: boolean; onSkip: () => void }) {
  const items: { ok: boolean; label: string; fix: string }[] = [
    { ok: !!checks?.visible, label: 'Whole body in frame', fix: 'Step back or tilt the phone until your arms and legs are all in view' },
    {
      ok: checks?.distance === 'ok',
      label: 'Good distance',
      fix: checks?.distance === 'back' ? 'Too close — step back' : 'Too far — come a bit closer',
    },
    {
      ok: checks?.view === 'ok',
      label: VIEW_LABEL[prof.view],
      fix: checks?.view === 'turn-side' ? 'Turn 90° so your side faces the phone' : 'Turn to face the phone',
    },
  ];
  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-top">
          <ViewDiagram view={prof.view} />
          <div>
            <span className="eyebrow accent">Set up · {VIEW_LABEL[prof.view]}{prof.beta ? ' · beta' : ''}</span>
            <p>{prof.hint}</p>
          </div>
        </div>
        <ul className="setup-list">
          {items.map((it) => (
            <li key={it.label} className={it.ok ? 'ok' : ''}>
              <i>{it.ok ? <Check size={13} strokeWidth={3} /> : null}</i>
              <span>
                <b>{it.label}</b>
                {!it.ok && checks && <small>{it.fix}</small>}
              </span>
            </li>
          ))}
        </ul>
        {canSkip && (
          <button className="link-btn" onClick={onSkip}>
            Start anyway
          </button>
        )}
      </div>
    </div>
  );
}

/** top-down sketch: where the phone goes relative to you */
function ViewDiagram({ view }: { view: 'side' | 'front' | 'angle' }) {
  const rot = view === 'side' ? 90 : view === 'angle' ? 45 : 0;
  return (
    <svg className="view-diagram" viewBox="0 0 64 64" aria-hidden>
      <rect x="27" y="47" width="10" height="14" rx="2.5" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M32 46 L24 33 M32 46 L40 33" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="2 2" opacity="0.7" />
      <g transform={`rotate(${rot} 32 18)`}>
        <ellipse cx="32" cy="18" rx="11" ry="6" fill="var(--surface-3)" stroke="var(--text)" strokeWidth="1.6" />
        <circle cx="32" cy="18" r="4" fill="var(--text)" />
        <path d="M32 24.5 l-3 3 h6 z" fill="var(--text)" />
      </g>
    </svg>
  );
}
