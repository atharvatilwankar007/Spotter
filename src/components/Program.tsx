import { ArrowDown, ArrowUp, ChevronRight, Download, Plus, Smartphone, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { isNative } from '../lib/native';
import { mmss } from '../lib/progress';
import { deleteDay, exportJSON, getState, importJSON, moveDay, saveDay, saveExercise, setSettings, uid, useStore } from '../lib/store';
import type { Day, Exercise, Muscle } from '../lib/types';
import { MUSCLE_ORDER } from '../lib/library';
import { ExercisePicker } from './ExercisePicker';
import { Sheet } from './Sheet';

const MUSCLES: Muscle[] = MUSCLE_ORDER;
const APK_URL = 'https://github.com/atharvatilwankar007/Spotter/releases/latest/download/Spotter.apk';

export function Program() {
  const s = useStore((x) => x);
  const [dayId, setDayId] = useState<string | null>(null);
  const [exId, setExId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spotter-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="program">
      <header className="page-head">
        <h1>Program</h1>
      </header>

      <span className="eyebrow">Training days · in rotation order</span>
      <div className="stack">
        {s.days.map((d, i) => (
          <div key={d.id} className="day-card">
            <button className="day-card-main" onClick={() => setDayId(d.id)}>
              <span className="plan-n tnum">{String(i + 1).padStart(2, '0')}</span>
              <span className="row-main">
                <b>{d.name}</b>
                <small className="muted">
                  {d.exerciseIds.length} exercises · {d.focus}
                </small>
              </span>
              <ChevronRight size={18} className="muted" />
            </button>
            <div className="day-card-move">
              <button className="icon-btn subtle" disabled={i === 0} onClick={() => moveDay(d.id, -1)} aria-label="Move up">
                <ArrowUp size={15} />
              </button>
              <button className="icon-btn subtle" disabled={i === s.days.length - 1} onClick={() => moveDay(d.id, 1)} aria-label="Move down">
                <ArrowDown size={15} />
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn-ghost"
          onClick={() => {
            const d: Day = { id: uid(), name: `Day ${s.days.length + 1}`, focus: '', exerciseIds: [] };
            saveDay(d);
            setDayId(d.id);
          }}
        >
          <Plus size={18} /> Add training day
        </button>
      </div>

      <span className="eyebrow">Settings</span>
      <div className="stack">
        <Toggle label="Rest timer sound" on={s.settings.sound} set={(v) => setSettings({ sound: v })} />
        <Toggle label="Vibration" on={s.settings.vibrate} set={(v) => setSettings({ vibrate: v })} />
        {!isNative && (
          <a className="row" href={APK_URL}>
            <Smartphone size={18} className="accent" />
            <span className="row-main">
              <b>Get the Android app</b>
              <small className="muted">Rest alarm rings even when the phone is locked</small>
            </span>
            <ChevronRight size={18} className="muted" />
          </a>
        )}
      </div>

      <span className="eyebrow">Your data lives only on this phone</span>
      <div className="stack">
        <button className="row" onClick={backup}>
          <Download size={18} />
          <span className="row-main">
            <b>Back up</b>
            <small className="muted">Save everything to a file</small>
          </span>
        </button>
        <button className="row" onClick={() => fileRef.current?.click()}>
          <Upload size={18} />
          <span className="row-main">
            <b>Restore</b>
            <small className="muted">Load a backup file (replaces current data)</small>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!confirm('Replace everything on this phone with this backup?')) return;
            try {
              importJSON(await f.text());
              alert('Backup restored.');
            } catch (err) {
              alert(String((err as Error).message || err));
            }
          }}
        />
      </div>
      <p className="foot muted">Spotter v0.6 · made on a Friday</p>

      <Sheet open={!!dayId} onClose={() => setDayId(null)}>
        {dayId && <DayEditor dayId={dayId} onClose={() => setDayId(null)} onEditEx={setExId} />}
      </Sheet>
      <Sheet open={!!exId} onClose={() => setExId(null)}>
        {exId && s.exercises[exId] && <ExerciseEditor ex={s.exercises[exId]} onClose={() => setExId(null)} />}
      </Sheet>
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button className="row" onClick={() => set(!on)} role="switch" aria-checked={on}>
      <span className="row-main">
        <b>{label}</b>
      </span>
      <span className={`switch ${on ? 'on' : ''}`}>
        <i />
      </span>
    </button>
  );
}

function DayEditor({ dayId, onClose, onEditEx }: { dayId: string; onClose: () => void; onEditEx: (id: string) => void }) {
  const s = useStore((x) => x);
  const day = s.days.find((d) => d.id === dayId);
  const [adding, setAdding] = useState(false);
  if (!day) return null;
  const upd = (p: Partial<Day>) => saveDay({ ...day, ...p });
  const move = (i: number, dir: number) => {
    const ids = [...day.exerciseIds];
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    upd({ exerciseIds: ids });
  };

  return (
    <div className="stack">
      <input className="title-input" value={day.name} onChange={(e) => upd({ name: e.target.value })} aria-label="Day name" />
      <input className="field" placeholder="Focus, e.g. Chest · Back" value={day.focus} onChange={(e) => upd({ focus: e.target.value })} />
      <span className="eyebrow">Exercises</span>
      {day.exerciseIds.map((id, i) => {
        const ex = s.exercises[id];
        if (!ex) return null;
        return (
          <div key={id} className="ex-edit-row">
            <button className="row-main left" onClick={() => onEditEx(id)}>
              <b>{ex.name}</b>
              <small className="muted tnum">
                {ex.sets} × {ex.repMin}–{ex.repMax} · rest {mmss(ex.rest)} · +{ex.step} kg
              </small>
            </button>
            <button className="icon-btn subtle" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
              <ArrowUp size={15} />
            </button>
            <button className="icon-btn subtle" onClick={() => move(i, 1)} disabled={i === day.exerciseIds.length - 1} aria-label="Move down">
              <ArrowDown size={15} />
            </button>
            <button className="icon-btn subtle" onClick={() => upd({ exerciseIds: day.exerciseIds.filter((x) => x !== id) })} aria-label="Remove">
              <X size={15} />
            </button>
          </div>
        );
      })}
      {!adding ? (
        <button className="btn-ghost" onClick={() => setAdding(true)}>
          <Plus size={18} /> Add exercise
        </button>
      ) : (
        <div className="stack tight">
          <div className="picker-done">
            <span className="eyebrow">Tap to add · tap more to add several</span>
            <button className="link-btn accent" onClick={() => setAdding(false)}>
              Done
            </button>
          </div>
          <ExercisePicker
            exclude={day.exerciseIds}
            onPick={(id) => upd({ exerciseIds: [...getState().days.find((d) => d.id === day.id)!.exerciseIds, id] })}
            onCreated={(id) => {
              setAdding(false);
              onEditEx(id);
            }}
          />
        </div>
      )}
      <button
        className="btn-ghost danger"
        onClick={() => {
          if (confirm(`Delete ${day.name}? Your history stays.`)) {
            deleteDay(day.id);
            onClose();
          }
        }}
      >
        <Trash2 size={16} /> Delete day
      </button>
    </div>
  );
}

function Num({ label, value, set, step = 1, min = 0, fmt }: { label: string; value: number; set: (v: number) => void; step?: number; min?: number; fmt?: (v: number) => string }) {
  return (
    <div className="num">
      <span className="eyebrow">{label}</span>
      <div className="num-row">
        <button className="icon-btn" onClick={() => set(Math.max(min, +(value - step).toFixed(2)))}>
          −
        </button>
        <b className="tnum">{fmt ? fmt(value) : value}</b>
        <button className="icon-btn" onClick={() => set(+(value + step).toFixed(2))}>
          +
        </button>
      </div>
    </div>
  );
}

function ExerciseEditor({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const upd = (p: Partial<Exercise>) => saveExercise({ ...ex, ...p });
  return (
    <div className="stack">
      <input className="title-input" value={ex.name} onChange={(e) => upd({ name: e.target.value })} aria-label="Exercise name" />
      <div className="chips wrap">
        {MUSCLES.map((m) => (
          <button key={m} className={`chip ${ex.muscle === m ? 'on' : ''}`} onClick={() => upd({ muscle: m })}>
            {m}
          </button>
        ))}
      </div>
      <div className="num-grid">
        <Num label="Sets" value={ex.sets} min={1} set={(v) => upd({ sets: v })} />
        <Num label="Rest" value={ex.rest} min={15} step={15} set={(v) => upd({ rest: v })} fmt={mmss} />
        <Num label="Min reps" value={ex.repMin} min={1} set={(v) => upd({ repMin: Math.min(v, ex.repMax) })} />
        <Num label="Max reps" value={ex.repMax} min={1} set={(v) => upd({ repMax: Math.max(v, ex.repMin) })} />
        <Num label="Weight step kg" value={ex.step} min={0.5} step={0.5} set={(v) => upd({ step: v })} />
      </div>
      <textarea className="field" rows={2} placeholder="Notes — seat height, grip, cues…" value={ex.notes} onChange={(e) => upd({ notes: e.target.value })} />
      <p className="muted small">
        Spotter suggests your next goal: hit {ex.repMax} reps on every set and it adds {ex.step} kg, otherwise it asks for one more rep.
      </p>
      <button className="btn-primary" onClick={onClose}>
        Done
      </button>
    </div>
  );
}
