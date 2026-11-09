import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { fromShow, kindOf, shortLoad, stepShow, toShow, unitLabel } from '../lib/load';
import { deleteSet, getState, updateSet } from '../lib/store';
import type { Exercise, SetLog } from '../lib/types';
import { Scrubber } from './Scrubber';
import { Sheet } from './Sheet';

export interface EditTarget {
  sessionId: string;
  set: SetLog;
}

/** Fix the weight or reps of any logged set, or delete it. Works during a workout and on past ones. */
export function SetEditSheet({ edit, onClose, onDeleted }: { edit: EditTarget | null; onClose: () => void; onDeleted?: () => void }) {
  const ex = edit ? getState().exercises[edit.set.exId] : undefined;
  return createPortal(
    <Sheet open={!!edit && !!ex} onClose={onClose} title={ex ? `Edit set · ${ex.name}` : ''}>
      {edit && ex && <Form key={edit.set.t} edit={edit} ex={ex} onClose={onClose} onDeleted={onDeleted} />}
    </Sheet>,
    document.body,
  );
}

function Form({ edit, ex, onClose, onDeleted }: { edit: EditTarget; ex: Exercise; onClose: () => void; onDeleted?: () => void }) {
  // show the set the way it was logged, even if the exercise has since changed how it's tracked
  const view: Exercise = { ...ex, load: edit.set.u ?? 'weight' };
  const kind = kindOf(view);
  const [w, setW] = useState(edit.set.w);
  const [r, setR] = useState(edit.set.r);
  return (
    <div className="stack">
      <Scrubber
        label={kind === 'holes' ? 'Holes' : kind === 'bar' ? 'Plates on the bar' : 'Weight'}
        unit={unitLabel(view)}
        value={toShow(w, view)}
        step={stepShow(view)}
        max={1100}
        onChange={(v) => setW(fromShow(v, view))}
      />
      <Scrubber label="Reps" value={r} step={1} min={0} max={100} onChange={setR} />
      <button
        className="btn-primary big"
        onClick={() => {
          updateSet(edit.sessionId, edit.set.t, { w, r });
          onClose();
        }}
      >
        <Check size={22} /> Save
      </button>
      <button
        className="btn-ghost danger"
        onClick={() => {
          deleteSet(edit.sessionId, edit.set.t);
          onDeleted?.();
          onClose();
        }}
      >
        <Trash2 size={16} /> Delete this set
      </button>
    </div>
  );
}

/** A row of logged sets; tap one to fix it */
export function SetChips({ sessionId, sets, ex }: { sessionId: string; sets: SetLog[]; ex: Exercise }) {
  const [edit, setEdit] = useState<EditTarget | null>(null);
  return (
    <>
      <div className="set-chips tnum">
        {sets.map((x) => (
          <button key={x.t} onClick={() => setEdit({ sessionId, set: x })} aria-label={`Edit set ${shortLoad(x, ex)} by ${x.r}`}>
            {shortLoad(x, ex)}×{x.r}
          </button>
        ))}
      </div>
      <SetEditSheet edit={edit} onClose={() => setEdit(null)} />
    </>
  );
}

/** Every set of a workout grouped by exercise, each one editable */
export function SessionSets({ sessionId }: { sessionId: string }) {
  const s = getState();
  const ses = s.sessions.find((x) => x.id === sessionId);
  if (!ses) return null;
  const ids = ses.sets.map((x) => x.exId).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="stack tight">
      {ids.map((id) => {
        const ex = s.exercises[id];
        if (!ex) return null;
        return (
          <div key={id} className="set-group">
            <b>{ex.name}</b>
            <SetChips sessionId={sessionId} sets={ses.sets.filter((x) => x.exId === id)} ex={ex} />
          </div>
        );
      })}
    </div>
  );
}
