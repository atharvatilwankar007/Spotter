import { Check, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fromLibrary, LIBRARY, MUSCLE_ORDER, search, slug } from '../lib/library';
import { thump } from '../lib/native';
import { getState, saveExercise, useStore } from '../lib/store';
import type { Equip, Exercise, Muscle } from '../lib/types';

interface Item {
  name: string;
  muscle: Muscle;
  equip: Equip | undefined;
  kind: 'c' | 'i';
  hay: string;
  id?: string; // already one of your exercises
}

/** Search the library + your own exercises. Picking one adds it to your exercises (if new) and returns its id. */
export function ExercisePicker({ exclude = [], onPick, onCreated }: { exclude?: string[]; onPick: (id: string) => void; onCreated?: (id: string) => void }) {
  const mine = useStore((s) => s.exercises);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);

  const items = useMemo<Item[]>(() => {
    const byName = new Map<string, Item>();
    for (const it of LIBRARY) byName.set(it.name.toLowerCase(), { ...it });
    for (const ex of Object.values(mine)) {
      const k = ex.name.toLowerCase();
      const lib = byName.get(k);
      byName.set(k, {
        name: ex.name,
        muscle: ex.muscle,
        equip: ex.equip ?? lib?.equip,
        kind: lib?.kind ?? (ex.rest >= 150 ? 'c' : 'i'),
        hay: lib?.hay ?? `${ex.name} ${ex.muscle} ${ex.equip ?? ''}`.toLowerCase().replace(/-/g, ' '),
        id: ex.id,
      });
    }
    return [...byName.values()];
  }, [mine]);

  const shown = useMemo(() => {
    const list = search(items, q).filter((it) => !muscle || it.muscle === muscle);
    if (q.trim()) return list; // already ranked by relevance
    return list.sort((a, b) => MUSCLE_ORDER.indexOf(a.muscle) - MUSCLE_ORDER.indexOf(b.muscle) || Number(!a.id) - Number(!b.id) || a.name.localeCompare(b.name));
  }, [items, q, muscle]);

  const pick = (it: Item) => {
    thump();
    if (it.id) return onPick(it.id);
    const ex = fromLibrary({ name: it.name, muscle: it.muscle, equip: it.equip ?? 'Machine', kind: it.kind });
    let id = ex.id;
    for (let n = 2; getState().exercises[id]; n++) id = `${ex.id}-${n}`;
    saveExercise({ ...ex, id });
    onPick(id);
  };

  const create = () => {
    const name = q.trim().replace(/\b\w/g, (c) => c.toUpperCase());
    let id = slug(name) || 'custom';
    for (let n = 2; getState().exercises[id]; n++) id = `${slug(name)}-${n}`;
    const ex: Exercise = { ...fromLibrary({ name, muscle: muscle ?? 'Chest', equip: 'Machine', kind: 'i' }), id, equip: undefined };
    saveExercise(ex);
    onPick(id);
    onCreated?.(id);
  };

  const exact = shown.some((it) => it.name.toLowerCase() === q.trim().toLowerCase());
  let lastMuscle: Muscle | null = null;

  return (
    <div className="picker">
      <div className="picker-head">
        <label className="search">
          <Search size={18} className="muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 180+ exercises — try “incline curl”" enterKeyHint="search" />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </label>
        <div className="chips">
          <button className={`chip sm ${!muscle ? 'on' : ''}`} onClick={() => setMuscle(null)}>
            All
          </button>
          {MUSCLE_ORDER.map((m) => (
            <button key={m} className={`chip sm ${muscle === m ? 'on' : ''}`} onClick={() => setMuscle(muscle === m ? null : m)}>
              {m === 'Core' ? 'Abs & core' : m}
            </button>
          ))}
        </div>
      </div>

      <div className="picker-list">
        {shown.map((it) => {
          const header = !q && it.muscle !== lastMuscle ? it.muscle : null;
          lastMuscle = it.muscle;
          const added = !!it.id && exclude.includes(it.id);
          return (
            <div key={it.name}>
              {header && <span className="eyebrow picker-group">{header === 'Core' ? 'Abs & core' : header}</span>}
              <button className="pick-row" onClick={() => !added && pick(it)} disabled={added}>
                <span className="row-main">
                  <b>{it.name}</b>
                  <small className="muted">
                    {[it.equip, it.muscle].filter(Boolean).join(' · ')}
                    {it.id && !added ? ' · yours' : ''}
                  </small>
                </span>
                {added ? <Check size={18} className="accent" /> : <Plus size={18} className="muted" />}
              </button>
            </div>
          );
        })}
        {q.trim() && !exact && (
          <button className="row accent-row" onClick={create}>
            <Plus size={18} />
            <span className="row-main">
              <b>Create “{q.trim()}”</b>
              <small className="muted">Your own exercise{muscle ? ` · ${muscle}` : ''}</small>
            </span>
          </button>
        )}
        {!shown.length && !q.trim() && <p className="muted pad">Nothing here yet.</p>}
      </div>
    </div>
  );
}
