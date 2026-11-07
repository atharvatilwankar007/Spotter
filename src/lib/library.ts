// Exercise library: common gym movements and their variations, searchable.
import type { Equip, Exercise, Muscle } from './types';

// [name, muscle, equipment, kind]  kind: c = compound (heavier, longer rest), i = isolation
type Row = [string, Muscle, Equip, 'c' | 'i', string?];

const ROWS: Row[] = [
  // ---- Chest
  ['Barbell Bench Press', 'Chest', 'Barbell', 'c', 'flat bench'],
  ['Incline Bench Press', 'Chest', 'Barbell', 'c', 'incline barbell upper chest'],
  ['Decline Bench Press', 'Chest', 'Barbell', 'c'],
  ['Paused Bench Press', 'Chest', 'Barbell', 'c'],
  ['Dumbbell Bench Press', 'Chest', 'Dumbbell', 'c', 'db flat press'],
  ['Incline Dumbbell Press', 'Chest', 'Dumbbell', 'c', 'db upper chest'],
  ['Decline Dumbbell Press', 'Chest', 'Dumbbell', 'c'],
  ['Smith Machine Bench Press', 'Chest', 'Smith', 'c'],
  ['Smith Machine Incline Press', 'Chest', 'Smith', 'c', 'upper chest'],
  ['Machine Chest Press', 'Chest', 'Machine', 'c', 'seated press'],
  ['Incline Machine Press', 'Chest', 'Machine', 'c', 'upper chest'],
  ['Pec Deck', 'Chest', 'Machine', 'i', 'butterfly machine fly'],
  ['Cable Fly', 'Chest', 'Cable', 'i', 'crossover'],
  ['Low-to-High Cable Fly', 'Chest', 'Cable', 'i', 'upper chest crossover'],
  ['High-to-Low Cable Fly', 'Chest', 'Cable', 'i', 'lower chest crossover'],
  ['Dumbbell Fly', 'Chest', 'Dumbbell', 'i'],
  ['Incline Dumbbell Fly', 'Chest', 'Dumbbell', 'i'],
  ['Push-up', 'Chest', 'Bodyweight', 'c', 'pushup press up'],
  ['Weighted Push-up', 'Chest', 'Bodyweight', 'c', 'pushup plate'],
  ['Deficit Push-up', 'Chest', 'Bodyweight', 'c', 'pushup'],
  ['Chest Dip', 'Chest', 'Bodyweight', 'c', 'dips'],
  ['Dumbbell Pullover', 'Chest', 'Dumbbell', 'i'],
  ['Landmine Press', 'Chest', 'Barbell', 'c'],
  // ---- Back
  ['Deadlift', 'Back', 'Barbell', 'c', 'conventional'],
  ['Rack Pull', 'Back', 'Barbell', 'c'],
  ['Barbell Row', 'Back', 'Barbell', 'c', 'bent over row'],
  ['Pendlay Row', 'Back', 'Barbell', 'c'],
  ['T-Bar Row', 'Back', 'Barbell', 'c', 'landmine row'],
  ['Dumbbell Row', 'Back', 'Dumbbell', 'c', 'one arm single arm db row'],
  ['Chest-Supported Row', 'Back', 'Dumbbell', 'c', 'incline row'],
  ['Seal Row', 'Back', 'Barbell', 'c'],
  ['Meadows Row', 'Back', 'Barbell', 'c'],
  ['Seated Cable Row', 'Back', 'Cable', 'c', 'low row'],
  ['Single-Arm Cable Row', 'Back', 'Cable', 'c'],
  ['Wide-Grip Cable Row', 'Back', 'Cable', 'c', 'upper back'],
  ['Machine Row', 'Back', 'Machine', 'c', 'seated row hammer strength'],
  ['Lat Pulldown', 'Back', 'Cable', 'c', 'lats'],
  ['Wide-Grip Lat Pulldown', 'Back', 'Cable', 'c', 'lats'],
  ['Close-Grip Lat Pulldown', 'Back', 'Cable', 'c', 'v-bar lats'],
  ['Reverse-Grip Lat Pulldown', 'Back', 'Cable', 'c', 'underhand lats'],
  ['Single-Arm Lat Pulldown', 'Back', 'Cable', 'c', 'lats'],
  ['Machine Pulldown', 'Back', 'Machine', 'c', 'lats'],
  ['Pull-up', 'Back', 'Bodyweight', 'c', 'pullup lats'],
  ['Weighted Pull-up', 'Back', 'Bodyweight', 'c', 'pullup lats'],
  ['Chin-up', 'Back', 'Bodyweight', 'c', 'chinup'],
  ['Neutral-Grip Pull-up', 'Back', 'Bodyweight', 'c', 'pullup'],
  ['Assisted Pull-up', 'Back', 'Machine', 'c', 'pullup'],
  ['Inverted Row', 'Back', 'Bodyweight', 'c', 'australian pull up'],
  ['Straight-Arm Pulldown', 'Back', 'Cable', 'i', 'lats pullover'],
  ['Cable Pullover', 'Back', 'Cable', 'i', 'lats'],
  ['Back Extension', 'Back', 'Bodyweight', 'i', 'hyperextension lower back'],
  // ---- Shoulders
  ['Overhead Press', 'Shoulders', 'Barbell', 'c', 'ohp military press'],
  ['Seated Barbell Press', 'Shoulders', 'Barbell', 'c', 'ohp'],
  ['Push Press', 'Shoulders', 'Barbell', 'c'],
  ['Seated Dumbbell Shoulder Press', 'Shoulders', 'Dumbbell', 'c', 'db ohp'],
  ['Standing Dumbbell Press', 'Shoulders', 'Dumbbell', 'c', 'db ohp'],
  ['Arnold Press', 'Shoulders', 'Dumbbell', 'c'],
  ['Machine Shoulder Press', 'Shoulders', 'Machine', 'c'],
  ['Smith Machine Shoulder Press', 'Shoulders', 'Smith', 'c'],
  ['Lateral Raise', 'Shoulders', 'Dumbbell', 'i', 'side delt'],
  ['Seated Lateral Raise', 'Shoulders', 'Dumbbell', 'i', 'side delt'],
  ['Cable Lateral Raise', 'Shoulders', 'Cable', 'i', 'side delt'],
  ['Machine Lateral Raise', 'Shoulders', 'Machine', 'i', 'side delt'],
  ['Lean-Away Lateral Raise', 'Shoulders', 'Dumbbell', 'i', 'side delt'],
  ['Front Raise', 'Shoulders', 'Dumbbell', 'i', 'front delt'],
  ['Cable Front Raise', 'Shoulders', 'Cable', 'i', 'front delt'],
  ['Plate Front Raise', 'Shoulders', 'Plate', 'i', 'front delt'],
  ['Rear Delt Fly', 'Shoulders', 'Dumbbell', 'i', 'reverse fly rear delt'],
  ['Reverse Pec Deck', 'Shoulders', 'Machine', 'i', 'rear delt fly'],
  ['Cable Rear Delt Fly', 'Shoulders', 'Cable', 'i', 'rear delt'],
  ['Face Pull', 'Shoulders', 'Cable', 'i', 'rear delt'],
  ['Upright Row', 'Shoulders', 'Barbell', 'i'],
  ['Cable Upright Row', 'Shoulders', 'Cable', 'i'],
  ['Cable Y-Raise', 'Shoulders', 'Cable', 'i'],
  // ---- Traps
  ['Barbell Shrug', 'Traps', 'Barbell', 'i'],
  ['Dumbbell Shrug', 'Traps', 'Dumbbell', 'i'],
  ['Smith Machine Shrug', 'Traps', 'Smith', 'i'],
  ['Cable Shrug', 'Traps', 'Cable', 'i'],
  ["Farmer's Carry", 'Traps', 'Dumbbell', 'c', 'farmers walk grip'],
  // ---- Biceps
  ['Barbell Curl', 'Biceps', 'Barbell', 'i'],
  ['EZ-Bar Curl', 'Biceps', 'Barbell', 'i', 'ez bar'],
  ['Dumbbell Curl', 'Biceps', 'Dumbbell', 'i', 'db curl'],
  ['Alternating Dumbbell Curl', 'Biceps', 'Dumbbell', 'i'],
  ['Incline Dumbbell Curl', 'Biceps', 'Dumbbell', 'i', 'incline curl'],
  ['Hammer Curl', 'Biceps', 'Dumbbell', 'i', 'brachialis'],
  ['Cross-Body Hammer Curl', 'Biceps', 'Dumbbell', 'i'],
  ['Preacher Curl', 'Biceps', 'Barbell', 'i', 'ez bar scott curl'],
  ['Dumbbell Preacher Curl', 'Biceps', 'Dumbbell', 'i'],
  ['Machine Preacher Curl', 'Biceps', 'Machine', 'i'],
  ['Concentration Curl', 'Biceps', 'Dumbbell', 'i'],
  ['Spider Curl', 'Biceps', 'Dumbbell', 'i'],
  ['Cable Curl', 'Biceps', 'Cable', 'i'],
  ['Bayesian Cable Curl', 'Biceps', 'Cable', 'i', 'behind body curl'],
  ['Rope Hammer Curl', 'Biceps', 'Cable', 'i'],
  ['Drag Curl', 'Biceps', 'Barbell', 'i'],
  ['Zottman Curl', 'Biceps', 'Dumbbell', 'i'],
  ['Machine Curl', 'Biceps', 'Machine', 'i'],
  // ---- Triceps
  ['Triceps Pushdown', 'Triceps', 'Cable', 'i', 'bar pushdown'],
  ['Rope Pushdown', 'Triceps', 'Cable', 'i', 'triceps rope'],
  ['Single-Arm Cable Pushdown', 'Triceps', 'Cable', 'i'],
  ['Overhead Cable Triceps Extension', 'Triceps', 'Cable', 'i', 'rope overhead extension'],
  ['Overhead Dumbbell Extension', 'Triceps', 'Dumbbell', 'i', 'triceps extension'],
  ['Overhead Triceps Extension', 'Triceps', 'Cable', 'i'],
  ['Skull Crusher', 'Triceps', 'Barbell', 'i', 'ez bar lying triceps extension'],
  ['Dumbbell Skull Crusher', 'Triceps', 'Dumbbell', 'i', 'lying extension'],
  ['Close-Grip Bench Press', 'Triceps', 'Barbell', 'c', 'cgbp'],
  ['JM Press', 'Triceps', 'Barbell', 'c'],
  ['Dips', 'Triceps', 'Bodyweight', 'c', 'parallel bar dip'],
  ['Weighted Dips', 'Triceps', 'Bodyweight', 'c'],
  ['Bench Dip', 'Triceps', 'Bodyweight', 'i'],
  ['Triceps Kickback', 'Triceps', 'Dumbbell', 'i'],
  ['Cable Kickback', 'Triceps', 'Cable', 'i', 'triceps kickback'],
  ['Machine Triceps Extension', 'Triceps', 'Machine', 'i'],
  ['Diamond Push-up', 'Triceps', 'Bodyweight', 'c', 'close grip pushup'],
  // ---- Forearms
  ['Wrist Curl', 'Forearms', 'Dumbbell', 'i', 'grip'],
  ['Reverse Wrist Curl', 'Forearms', 'Dumbbell', 'i', 'grip'],
  ['Reverse Curl', 'Forearms', 'Barbell', 'i', 'brachioradialis'],
  ['Dead Hang', 'Forearms', 'Bodyweight', 'i', 'grip hang'],
  // ---- Quads
  ['Back Squat', 'Quads', 'Barbell', 'c', 'squat'],
  ['Front Squat', 'Quads', 'Barbell', 'c', 'squat'],
  ['Pause Squat', 'Quads', 'Barbell', 'c', 'squat'],
  ['Box Squat', 'Quads', 'Barbell', 'c', 'squat'],
  ['Goblet Squat', 'Quads', 'Dumbbell', 'c', 'squat kettlebell'],
  ['Smith Machine Squat', 'Quads', 'Smith', 'c', 'squat'],
  ['Hack Squat', 'Quads', 'Machine', 'c', 'squat'],
  ['Pendulum Squat', 'Quads', 'Machine', 'c', 'squat'],
  ['Belt Squat', 'Quads', 'Machine', 'c', 'squat'],
  ['Leg Press', 'Quads', 'Machine', 'c'],
  ['Single-Leg Leg Press', 'Quads', 'Machine', 'c'],
  ['Bulgarian Split Squat', 'Quads', 'Dumbbell', 'c', 'rfess split squat'],
  ['Split Squat', 'Quads', 'Dumbbell', 'c'],
  ['Walking Lunge', 'Quads', 'Dumbbell', 'c', 'lunges'],
  ['Reverse Lunge', 'Quads', 'Dumbbell', 'c', 'lunges'],
  ['Barbell Lunge', 'Quads', 'Barbell', 'c', 'lunges'],
  ['Step-up', 'Quads', 'Dumbbell', 'c', 'box step up'],
  ['Leg Extension', 'Quads', 'Machine', 'i', 'quad extension'],
  ['Single-Leg Leg Extension', 'Quads', 'Machine', 'i'],
  ['Sissy Squat', 'Quads', 'Bodyweight', 'i'],
  // ---- Hamstrings
  ['Romanian Deadlift', 'Hamstrings', 'Barbell', 'c', 'rdl'],
  ['Dumbbell Romanian Deadlift', 'Hamstrings', 'Dumbbell', 'c', 'db rdl'],
  ['Single-Leg Romanian Deadlift', 'Hamstrings', 'Dumbbell', 'c', 'rdl'],
  ['Stiff-Leg Deadlift', 'Hamstrings', 'Barbell', 'c', 'sldl'],
  ['Good Morning', 'Hamstrings', 'Barbell', 'c'],
  ['Seated Leg Curl', 'Hamstrings', 'Machine', 'i', 'hamstring curl'],
  ['Lying Leg Curl', 'Hamstrings', 'Machine', 'i', 'hamstring curl'],
  ['Standing Leg Curl', 'Hamstrings', 'Machine', 'i', 'single leg hamstring curl'],
  ['Nordic Curl', 'Hamstrings', 'Bodyweight', 'i', 'nordic hamstring'],
  ['Glute-Ham Raise', 'Hamstrings', 'Bodyweight', 'i', 'ghr'],
  // ---- Glutes
  ['Hip Thrust', 'Glutes', 'Barbell', 'c', 'barbell glute'],
  ['Machine Hip Thrust', 'Glutes', 'Machine', 'c'],
  ['Single-Leg Hip Thrust', 'Glutes', 'Bodyweight', 'c'],
  ['Glute Bridge', 'Glutes', 'Barbell', 'c'],
  ['Sumo Deadlift', 'Glutes', 'Barbell', 'c'],
  ['Cable Pull-Through', 'Glutes', 'Cable', 'c'],
  ['Cable Glute Kickback', 'Glutes', 'Cable', 'i'],
  ['Hip Abduction Machine', 'Glutes', 'Machine', 'i', 'abductor outer thigh'],
  ['Kettlebell Swing', 'Glutes', 'Kettlebell', 'c'],
  ['Hip Adduction Machine', 'Adductors', 'Machine', 'i', 'adductor inner thigh'],
  ['Copenhagen Plank', 'Adductors', 'Bodyweight', 'i', 'adductor'],
  // ---- Calves
  ['Standing Calf Raise', 'Calves', 'Machine', 'i'],
  ['Seated Calf Raise', 'Calves', 'Machine', 'i'],
  ['Leg Press Calf Raise', 'Calves', 'Machine', 'i'],
  ['Smith Machine Calf Raise', 'Calves', 'Smith', 'i'],
  ['Single-Leg Calf Raise', 'Calves', 'Dumbbell', 'i'],
  ['Donkey Calf Raise', 'Calves', 'Machine', 'i'],
  // ---- Core
  ['Cable Crunch', 'Core', 'Cable', 'i', 'abs kneeling crunch'],
  ['Crunch', 'Core', 'Bodyweight', 'i', 'abs'],
  ['Decline Crunch', 'Core', 'Bodyweight', 'i', 'abs'],
  ['Machine Crunch', 'Core', 'Machine', 'i', 'abs'],
  ['Sit-up', 'Core', 'Bodyweight', 'i', 'abs situp'],
  ['Bicycle Crunch', 'Core', 'Bodyweight', 'i', 'abs obliques'],
  ['Hanging Leg Raise', 'Core', 'Bodyweight', 'i', 'abs lower abs'],
  ['Hanging Knee Raise', 'Core', 'Bodyweight', 'i', 'abs lower abs'],
  ["Captain's Chair Leg Raise", 'Core', 'Bodyweight', 'i', 'abs lower abs knee raise'],
  ['Lying Leg Raise', 'Core', 'Bodyweight', 'i', 'abs lower abs'],
  ['Reverse Crunch', 'Core', 'Bodyweight', 'i', 'abs lower abs'],
  ['V-up', 'Core', 'Bodyweight', 'i', 'abs'],
  ['Ab Wheel Rollout', 'Core', 'Bodyweight', 'i', 'abs roller'],
  ['Plank', 'Core', 'Bodyweight', 'i', 'abs hold'],
  ['Side Plank', 'Core', 'Bodyweight', 'i', 'obliques hold'],
  ['Hollow Hold', 'Core', 'Bodyweight', 'i', 'abs'],
  ['Dead Bug', 'Core', 'Bodyweight', 'i', 'abs'],
  ['Russian Twist', 'Core', 'Plate', 'i', 'obliques'],
  ['Pallof Press', 'Core', 'Cable', 'i', 'anti rotation obliques'],
  ['Cable Woodchopper', 'Core', 'Cable', 'i', 'obliques wood chop'],
  ['Dumbbell Side Bend', 'Core', 'Dumbbell', 'i', 'obliques'],
];

export interface LibItem {
  name: string;
  muscle: Muscle;
  equip: Equip;
  kind: 'c' | 'i';
  hay: string; // lowercase search text
}

export const LIBRARY: LibItem[] = ROWS.map(([name, muscle, equip, kind, alias]) => ({
  name,
  muscle,
  equip,
  kind,
  hay: `${name} ${muscle} ${equip} ${alias ?? ''} ${muscle === 'Core' ? 'abs' : ''}`.toLowerCase().replace(/-/g, ' '),
}));

export const MUSCLE_ORDER: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Traps', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Calves', 'Core'];

/** every word of the query must appear somewhere (name, muscle, equipment or nickname); best matches first */
export function search<T extends { hay: string; name: string }>(items: T[], q: string): T[] {
  const norm = q.toLowerCase().replace(/-/g, ' ').trim();
  const words = norm.split(/s+/).filter(Boolean);
  if (!words.length) return items;
  const score = (it: T) => {
    const name = it.name.toLowerCase().replace(/-/g, ' ');
    if (name.includes(norm)) return name.startsWith(norm) ? 0 : 1; // the phrase itself
    if (words.every((w) => (' ' + name).includes(' ' + w))) return 2; // every word starts a word in the name
    if (words.every((w) => name.includes(w))) return 3;
    return 4;
  };
  return items
    .filter((it) => words.every((w) => it.hay.includes(w)))
    .map((it) => ({ it, s: score(it) }))
    .sort((x, y) => x.s - y.s)
    .map((x) => x.it);
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** sensible starting targets for a new exercise */
export function fromLibrary(it: { name: string; muscle: Muscle; equip: Equip; kind: 'c' | 'i' }): Exercise {
  const heavy = it.kind === 'c';
  const step = it.equip === 'Dumbbell' ? 2 : it.equip === 'Kettlebell' ? 4 : it.equip === 'Machine' && /press|squat/i.test(it.name) ? 5 : 2.5;
  const core = it.muscle === 'Core' || it.muscle === 'Forearms';
  return {
    id: slug(it.name),
    name: it.name,
    muscle: it.muscle,
    equip: it.equip,
    sets: 3,
    repMin: core ? 10 : heavy ? 6 : 10,
    repMax: core ? 20 : heavy ? 10 : 15,
    rest: heavy ? 150 : core ? 60 : 90,
    step,
    notes: '',
  };
}
