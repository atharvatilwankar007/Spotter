import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { e1rm, fmtW, lastSets, sessionPRs, volume } from '../lib/progress';
import { useStore } from '../lib/store';

const spring = { type: 'spring', stiffness: 300, damping: 28 } as const;

export function Finish({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStore((x) => x);
  const ses = s.sessions.find((x) => x.id === id);
  if (!ses) return null;
  const day = s.days.find((d) => d.id === ses.dayId);
  const mins = Math.max(1, Math.round(((ses.end ?? Date.now()) - ses.start) / 60000));
  const prs = sessionPRs(s, ses);
  const exIds = ses.sets.map((x) => x.exId).filter((v, i, a) => a.indexOf(v) === i);

  return (
    <motion.div className="finish" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="finish-burst" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring} />
      <motion.span className="eyebrow accent" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 0.1 }}>
        Workout done
      </motion.span>
      <motion.h1 className="hero-title" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 0.15 }}>
        {day?.name ?? 'Workout'}
      </motion.h1>
      <motion.div className="hero-stats tnum" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 0.22 }}>
        <div>
          <b>{mins}</b>
          <span>min</span>
        </div>
        <div>
          <b>{ses.sets.length}</b>
          <span>sets</span>
        </div>
        <div>
          <b>{Math.round(volume(ses.sets)).toLocaleString()}</b>
          <span>kg moved</span>
        </div>
        <div>
          <b>{prs.length}</b>
          <span>new bests</span>
        </div>
      </motion.div>

      {prs.length > 0 && (
        <div className="stack tight">
          {prs.map((p, i) => (
            <motion.div key={p.exId} className="pr-row" initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...spring, delay: 0.35 + i * 0.08 }}>
              <Trophy size={18} />
              <span className="row-main">
                <b>{s.exercises[p.exId]?.name}</b>
                <small className="tnum">
                  {fmtW(p.w)} kg × {p.r} · e1RM {Math.round(e1rm(p.w, p.r))}
                </small>
              </span>
            </motion.div>
          ))}
        </div>
      )}

      <span className="eyebrow">Vs last time · top set</span>
      <div className="stack tight">
        {exIds.map((exId, i) => {
          const mine = ses.sets.filter((x) => x.exId === exId);
          const top = mine.reduce((a, b) => (e1rm(b.w, b.r) > e1rm(a.w, a.r) ? b : a));
          const prev = lastSets(s, exId, ses.id)?.sets;
          const ptop = prev?.reduce((a, b) => (e1rm(b.w, b.r) > e1rm(a.w, a.r) ? b : a));
          const diff = ptop ? e1rm(top.w, top.r) - e1rm(ptop.w, ptop.r) : null;
          return (
            <motion.div key={exId} className="cmp-row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 + i * 0.04 }}>
              <span className="row-main">
                <b>{s.exercises[exId]?.name}</b>
                <small className="muted tnum">
                  {ptop ? `${fmtW(ptop.w)}×${ptop.r} → ` : ''}
                  {fmtW(top.w)}×{top.r}
                </small>
              </span>
              <span className={`delta ${diff != null && diff > 0.01 ? 'up' : diff != null && diff < -0.01 ? 'down' : ''}`}>
                {diff == null ? 'new' : Math.abs(diff) < 0.01 ? 'same' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)} kg`}
              </span>
            </motion.div>
          );
        })}
      </div>

      <button className="btn-primary big" onClick={onClose}>
        Done
      </button>
    </motion.div>
  );
}
