import type { Day, Exercise, Muscle, State } from './types';

type Row = [id: string, name: string, muscle: Muscle, sets: number, repMin: number, repMax: number, rest: number, step: number];

const rows: Row[] = [
  // Upper A
  ['bench', 'Barbell Bench Press', 'Chest', 3, 6, 10, 180, 2.5],
  ['pulldown', 'Lat Pulldown', 'Back', 3, 8, 12, 150, 2.5],
  ['incline-db', 'Incline Dumbbell Press', 'Chest', 3, 8, 12, 150, 2],
  ['cable-row', 'Seated Cable Row', 'Back', 3, 8, 12, 150, 2.5],
  ['lateral', 'Lateral Raise', 'Shoulders', 3, 12, 15, 90, 1],
  // Upper B
  ['ohp', 'Overhead Press', 'Shoulders', 3, 6, 10, 180, 2.5],
  ['chest-row', 'Chest-Supported Row', 'Back', 3, 8, 12, 150, 2.5],
  ['incline-bb', 'Incline Bench Press', 'Chest', 3, 6, 10, 180, 2.5],
  ['pullup', 'Pull-up', 'Back', 3, 6, 10, 150, 2.5],
  ['pec-deck', 'Pec Deck', 'Chest', 3, 10, 15, 90, 2.5],
  ['rear-delt', 'Rear Delt Fly', 'Shoulders', 3, 12, 15, 90, 1],
  // Arms
  ['bb-curl', 'Barbell Curl', 'Biceps', 3, 8, 12, 120, 2.5],
  ['pushdown', 'Triceps Pushdown', 'Triceps', 3, 10, 15, 120, 2.5],
  ['hammer', 'Hammer Curl', 'Biceps', 3, 10, 12, 90, 2],
  ['oh-ext', 'Overhead Triceps Extension', 'Triceps', 3, 10, 15, 90, 2.5],
  ['preacher', 'Preacher Curl', 'Biceps', 2, 10, 15, 90, 2.5],
  ['dips', 'Dips', 'Triceps', 2, 8, 12, 120, 2.5],
  // Legs
  ['squat', 'Back Squat', 'Quads', 3, 5, 8, 180, 2.5],
  ['rdl', 'Romanian Deadlift', 'Hamstrings', 3, 6, 10, 180, 2.5],
  ['leg-press', 'Leg Press', 'Quads', 3, 10, 15, 150, 5],
  ['leg-curl', 'Seated Leg Curl', 'Hamstrings', 3, 10, 15, 90, 2.5],
  ['leg-ext', 'Leg Extension', 'Quads', 3, 12, 15, 90, 2.5],
  ['calf', 'Standing Calf Raise', 'Calves', 3, 10, 15, 90, 5],
];

const exercises: Record<string, Exercise> = Object.fromEntries(
  rows.map(([id, name, muscle, sets, repMin, repMax, rest, step]) => [
    id,
    { id, name, muscle, sets, repMin, repMax, rest, step, notes: '' },
  ]),
);

const days: Day[] = [
  { id: 'upper-a', name: 'Upper A', focus: 'Chest · Back · Shoulders', exerciseIds: ['bench', 'pulldown', 'incline-db', 'cable-row', 'lateral'] },
  { id: 'upper-b', name: 'Upper B', focus: 'Shoulders · Back · Chest', exerciseIds: ['ohp', 'chest-row', 'incline-bb', 'pullup', 'pec-deck', 'rear-delt'] },
  { id: 'arms', name: 'Arms', focus: 'Biceps · Triceps', exerciseIds: ['bb-curl', 'pushdown', 'hammer', 'oh-ext', 'preacher', 'dips'] },
  { id: 'legs', name: 'Legs', focus: 'Quads · Hamstrings · Calves', exerciseIds: ['squat', 'rdl', 'leg-press', 'leg-curl', 'leg-ext', 'calf'] },
];

export function defaultState(): State {
  return {
    v: 1,
    exercises: structuredClone(exercises),
    days: structuredClone(days),
    sessions: [],
    active: null,
    settings: { sound: true, vibrate: true },
  };
}
