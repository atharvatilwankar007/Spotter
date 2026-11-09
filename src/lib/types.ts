export type Muscle =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Traps'
  | 'Biceps'
  | 'Triceps'
  | 'Forearms'
  | 'Quads'
  | 'Hamstrings'
  | 'Glutes'
  | 'Adductors'
  | 'Calves'
  | 'Core';

export type Equip = 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Smith' | 'Bodyweight' | 'Kettlebell' | 'Plate';

export interface Exercise {
  id: string;
  name: string;
  muscle: Muscle;
  equip?: Equip;
  sets: number; // target working sets
  repMin: number;
  repMax: number;
  rest: number; // seconds
  step: number; // weight increment, kg
  notes: string;
  load?: LoadKind; // how you track it (default: plain weight)
  unit?: Unit; // overrides the default unit for this exercise
}

export type LoadKind = 'weight' | 'bar' | 'holes';
export type Unit = 'kg' | 'lb';

export interface Day {
  id: string;
  name: string; // "Upper A"
  focus: string; // "Chest · Back · Shoulders"
  exerciseIds: string[];
}

export interface SetLog {
  exId: string;
  w: number;
  r: number;
  t: number; // timestamp
  u?: 'bar' | 'holes'; // w = plates only (bar) or pin holes; absent = total kg
}

export interface Session {
  id: string;
  dayId: string;
  start: number;
  end?: number;
  sets: SetLog[];
}

export interface Active {
  sessionId: string;
  order: string[]; // exercise ids for this session
  exIdx: number;
  phase: 'log' | 'rest';
  restEndsAt: number;
  restTotal: number;
}

export interface Settings {
  sound: boolean;
  vibrate: boolean;
  unit?: Unit; // default weight unit
  defaultSets?: number; // sets for newly added exercises
  voice?: boolean; // say start / stop in Ghost Set (default on)
}

export interface State {
  v: 1;
  exercises: Record<string, Exercise>;
  days: Day[];
  sessions: Session[];
  active: Active | null;
  settings: Settings;
}
