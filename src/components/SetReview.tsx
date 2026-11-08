import { motion } from 'motion/react';
import type { Rating } from '../lib/rating';
import { useEffect, useRef, useState } from 'react';
import { BONES, GRADE_LABEL, signals, visibleTriple, type Analysis, type Frame, type Recording, type Signal } from '../lib/pose';

export interface Still {
  url: string; // in-memory JPEG, never saved
  frame: Frame; // body points at the deepest moment of the rep
  w: number;
  h: number;
}

/* ---------- colour-graded rep strip ---------- */

export function RepStrip({ a }: { a: Analysis }) {
  return (
    <div className="rep-strip">
      <div className="rep-cells">
        {a.grades.map((g, i) => (
          <div key={i} className={`rep-cell ${g}`} title={GRADE_LABEL[g]}>
            <i style={{ height: `${Math.max(18, a.speed[i] * 100)}%` }} />
            <span className="tnum">{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="rep-legend">
        <span>
          <b className="full" /> Full range
        </span>
        <span>
          <b className="short" /> A bit short
        </span>
        <span>
          <b className="cut" /> Cut short
        </span>
        <span className="muted">bar height = speed</span>
      </div>
    </div>
  );
}

/* ---------- annotated best-vs-worst stills ---------- */

const torso = (f: Frame) => {
  const sx = (f.p[2] + f.p[4]) / 2;
  const sy = (f.p[3] + f.p[5]) / 2;
  const hx = (f.p[14] + f.p[16]) / 2;
  const hy = (f.p[15] + f.p[17]) / 2;
  return { hx, hy, len: Math.hypot(sx - hx, sy - hy) };
};

function StillCanvas({ still, mirrored, signal, overlay, label, width, ar = 4 / 3 }: { still: Still; mirrored: boolean; signal: Signal; overlay?: Still; label: string; width: number; ar?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h = Math.round((width * still.h) / still.w);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = width * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      if (mirrored) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.filter = 'saturate(0.4) brightness(0.7)';
      ctx.drawImage(img, 0, 0, width, h);
      ctx.restore();
      const X = (x: number) => (mirrored ? 1 - x : x) * width;
      const Y = (y: number) => y * h;

      // the target: your best rep's pose, laid over this rep at the same hips and size
      if (overlay) {
        const a = torso(still.frame);
        const b = torso(overlay.frame);
        const k = b.len > 0.001 ? a.len / b.len : 1;
        const op = overlay.frame.p.map((v, i) => (i % 2 ? a.hy + (v - b.hy) * k : a.hx + (v - b.hx) * k));
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(255,106,43,0.95)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255,106,43,0.8)';
        ctx.shadowBlur = 10;
        for (const [i, j] of BONES) {
          if (overlay.frame.vis[i] < 0.3 || overlay.frame.vis[j] < 0.3) continue;
          ctx.beginPath();
          ctx.moveTo(X(op[i * 2]), Y(op[i * 2 + 1]));
          ctx.lineTo(X(op[j * 2]), Y(op[j * 2 + 1]));
          ctx.stroke();
        }
        ctx.restore();
      }

      // this rep's skeleton
      const f = still.frame;
      ctx.strokeStyle = 'rgba(243,239,231,0.95)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (const [i, j] of BONES) {
        if (f.vis[i] < 0.3 || f.vis[j] < 0.3) continue;
        ctx.beginPath();
        ctx.moveTo(X(f.p[i * 2]), Y(f.p[i * 2 + 1]));
        ctx.lineTo(X(f.p[j * 2]), Y(f.p[j * 2 + 1]));
        ctx.stroke();
      }

      // angle arc at the tracked joint
      const tri = visibleTriple(f, signal);
      const ang = signals(f, ar)[signal];
      if (tri && ang != null) {
        const [ia, ib, ic] = tri;
        const bx = X(f.p[ib * 2]);
        const by = Y(f.p[ib * 2 + 1]);
        const a1 = Math.atan2(Y(f.p[ia * 2 + 1]) - by, X(f.p[ia * 2]) - bx);
        const a2 = Math.atan2(Y(f.p[ic * 2 + 1]) - by, X(f.p[ic * 2]) - bx);
        let d = a2 - a1;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const rad = Math.max(16, width * 0.09);
        ctx.fillStyle = 'rgba(255,106,43,0.22)';
        ctx.strokeStyle = '#ff6a2b';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.arc(bx, by, rad, a1, a1 + d, d < 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff6a2b';
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        // degree label
        const mid = a1 + d / 2;
        const lx = bx + Math.cos(mid) * (rad + 18);
        const ly = by + Math.sin(mid) * (rad + 18);
        const txt = `${Math.round(ang)}°`;
        ctx.font = '650 13px Geist Variable, system-ui, sans-serif';
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(11,11,12,0.8)';
        ctx.beginPath();
        ctx.roundRect(lx - tw / 2 - 6, ly - 10, tw + 12, 20, 10);
        ctx.fill();
        ctx.fillStyle = '#f3efe7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, lx, ly + 1);
      }
    };
    img.src = still.url;
  }, [still, overlay, mirrored, signal, width, h, ar]);
  return (
    <div className="still">
      <canvas ref={ref} style={{ width, height: h }} />
      <span className="still-tag">{label}</span>
    </div>
  );
}

export function BestWorst({ stills, a, rec, mirrored }: { stills: (Still | null)[]; a: Analysis; rec: Recording; mirrored: boolean }) {
  const [big, setBig] = useState<'best' | 'worst' | null>(null);
  const best = stills[a.best];
  const worst = stills[a.worst];
  if (!best) return null;
  const same = a.best === a.worst || rec.reps[a.worst].rom >= rec.reps[a.best].rom * 0.95;
  const pct = Math.round((rec.reps[a.worst].rom / rec.reps[a.best].rom) * 100);
  if (same || !worst)
    return (
      <div className="bw">
        <StillCanvas still={best} mirrored={mirrored} signal={rec.signal} ar={rec.ar} label={`Best · rep ${a.best + 1}`} width={160} />
        <p className="bw-note">{a.reps === 1 ? 'Your rep at its deepest point.' : "Every rep hit the same range. That's what consistent looks like."}</p>
      </div>
    );
  const W = big ? 300 : 150;
  return (
    <div className="bw">
      <div className={`bw-pair ${big ? 'big' : ''}`}>
        {(!big || big === 'best') && (
          <button onClick={() => setBig(big ? null : 'best')} aria-label="Enlarge best rep">
            <StillCanvas still={best} mirrored={mirrored} signal={rec.signal} ar={rec.ar} label={`Best · rep ${a.best + 1}`} width={W} />
          </button>
        )}
        {(!big || big === 'worst') && (
          <button onClick={() => setBig(big ? null : 'worst')} aria-label="Enlarge shortest rep">
            <StillCanvas still={worst} mirrored={mirrored} signal={rec.signal} ar={rec.ar} overlay={best} label={`Shortest · rep ${a.worst + 1}`} width={W} />
          </button>
        )}
      </div>
      <p className="bw-note">
        Rep {a.worst + 1} reached <b>{pct}%</b> of your best rep's range. <span className="accent">Orange dashes</span> = where your best rep got to.
      </p>
    </div>
  );
}

/* ---------- the set rating (the summary's hero) ---------- */

export function SetScore({ rating, reps }: { rating: Rating; reps: number }) {
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <div className={`score ${rating.tone}`}>
      <div className="score-ring">
        <svg viewBox="0 0 110 110">
          <defs>
            <linearGradient id="scoreg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--accent-2)" />
              <stop offset="1" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          <circle cx="55" cy="55" r={R} className="score-track" />
          <motion.circle
            cx="55"
            cy="55"
            r={R}
            className="score-bar"
            stroke="url(#scoreg)"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - rating.score / 10) }}
            transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
            transform="rotate(-90 55 55)"
          />
        </svg>
        <div className="score-num tnum">
          <b>{rating.score.toFixed(1)}</b>
          <span>/ 10</span>
        </div>
      </div>
      <div className="score-text">
        <span className="eyebrow accent">
          {rating.label} · {reps} reps
        </span>
        <h2>{rating.headline}</h2>
      </div>
      <div className="score-next">
        <span className="eyebrow">Next set</span>
        <p>{rating.next}</p>
      </div>
    </div>
  );
}

export function ScoreParts({ rating }: { rating: Rating }) {
  return (
    <div className="score-parts">
      {rating.parts.map((p) => (
        <div key={p.key} className="score-part">
          <span>{p.label}</span>
          <i>
            <motion.b initial={{ scaleX: 0 }} animate={{ scaleX: p.value }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} />
          </i>
          <em className="tnum">{Math.round(p.value * 10)}</em>
        </div>
      ))}
    </div>
  );
}
