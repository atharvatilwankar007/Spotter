import { Minus, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { fmtW } from '../lib/progress';
import { thump, tick } from '../lib/native';

interface Props {
  label: string;
  unit?: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  delta?: number | null; // vs last time
  onChange: (v: number) => void;
}

const PX = 16; // drag distance per step

/** Big number you can drag sideways like an After Effects value, with a ruler that slides under it */
export function Scrubber({ label, unit, value, step, min = 0, max = 999, delta, onChange }: Props) {
  const drag = useRef<{ x: number; v: number; moved: boolean; id: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const set = (v: number) => {
    const c = +clamp(v).toFixed(2);
    if (c !== value) {
      tick();
      onChange(c);
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (editing) return;
    drag.current = { x: e.clientX, v: value, moved: false, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setActive(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    if (d.moved) set(d.v + Math.round(dx / PX) * step);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setActive(false);
    if (d && !d.moved) setEditing(true);
  };

  const offset = -(value / step) * PX;
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;

  return (
    <div className={`scrub ${active ? 'is-active' : ''}`}>
      <div className="scrub-head">
        <span className="eyebrow">{label}</span>
        {delta != null && delta !== 0 && (
          <span className={`delta ${up ? 'up' : ''} ${down ? 'down' : ''}`}>
            {up ? '▲' : '▼'} {fmtW(Math.abs(delta))}
            {unit ? ` ${unit}` : ''}
          </span>
        )}
      </div>
      <div className="scrub-row">
        <button
          className="step-btn"
          aria-label={`Less ${label}`}
          onClick={() => {
            thump();
            set(value - step);
          }}
        >
          <Minus size={22} strokeWidth={2.4} />
        </button>
        <div
          className="scrub-pad"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {editing ? (
            <input
              className="scrub-input"
              autoFocus
              inputMode="decimal"
              defaultValue={fmtW(value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                const n = parseFloat(e.currentTarget.value.replace(',', '.'));
                if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, +n.toFixed(2))));
                setEditing(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <div className="scrub-value">
              <span>{fmtW(value)}</span>
              {unit && <em>{unit}</em>}
            </div>
          )}
          <div className="ruler" style={{ backgroundPositionX: `calc(50% + ${offset + 39}px), calc(50% + ${offset + 7.5}px)` }}>
            <i className="ruler-needle" />
          </div>
        </div>
        <button
          className="step-btn"
          aria-label={`More ${label}`}
          onClick={() => {
            thump();
            set(value + step);
          }}
        >
          <Plus size={22} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
