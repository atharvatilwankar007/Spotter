// One number for a set (0–10), a one-line headline, and the single most useful thing to do next set.
import type { Analysis, RepStat } from './pose';
import { fmtW } from './progress';
import type { Exercise, SetLog } from './types';

export interface Rating {
  score: number; // 0..10, one decimal
  label: string; // Excellent set / Solid set / …
  tone: 'great' | 'good' | 'ok' | 'rough';
  headline: string;
  next: string; // the one tip for the next set
  parts: { key: string; label: string; value: number; weight: number }[]; // 0..1 each, for the detailed view
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function rateSet(opts: {
  a: Analysis;
  reps: RepStat[];
  count: number; // reps you're logging (after any −/+ fix)
  weight: number;
  ex: Exercise;
  last?: SetLog[]; // this exercise last time
}): Rating {
  const { a, reps, count, weight, ex, last } = opts;
  const n = reps.length;
  const maxRom = Math.max(0, ...reps.map((r) => r.rom));

  // 1. range consistency: every rep near your best depth
  const ratios = reps.map((r) => (maxRom ? r.rom / maxRom : 1));
  const avgRatio = n ? ratios.reduce((s, x) => s + x, 0) / n : 0;
  const cuts = a.grades.filter((g) => g === 'cut').length;
  const range = n ? clamp01((avgRatio - 0.7) / 0.28) * (1 - Math.min(0.4, cuts * 0.12)) : 0;

  // 2. reps vs your target range
  const target =
    count >= ex.repMin && count <= ex.repMax ? 1 : count < ex.repMin ? clamp01(1 - ((ex.repMin - count) / ex.repMin) * 1.6) : 0.85;

  // 3. control: steady tempo, no rushing or bouncing
  const durs = reps.map((r) => r.dur);
  const mean = n ? durs.reduce((s, x) => s + x, 0) / n : 0;
  const cv = n > 1 ? Math.sqrt(durs.reduce((s, x) => s + (x - mean) ** 2, 0) / n) / mean : 0;
  const rushed = n ? durs.filter((d) => d < 1).length / n : 0;
  const control = n ? clamp01(1 - Math.max(0, cv - 0.12) * 1.6) * (1 - rushed * 0.5) : 0;

  // 4. progress vs last time (skipped the first time you do an exercise)
  let progress: number | null = null;
  let progressNote: 'up' | 'same' | 'down' | null = null;
  if (last?.length) {
    const top = last.reduce((b, s) => (s.w > b.w || (s.w === b.w && s.r > b.r) ? s : b));
    if (weight > top.w) {
      progress = 1;
      progressNote = 'up';
    } else if (weight === top.w && count > top.r) {
      progress = 0.9;
      progressNote = 'up';
    } else if (weight === top.w && count === top.r) {
      progress = 0.7;
      progressNote = 'same';
    } else {
      progress = weight < top.w ? 0.6 : 0.5;
      progressNote = 'down';
    }
  }

  const parts = [
    { key: 'range', label: 'Range on every rep', value: range, weight: 0.4 },
    { key: 'target', label: `Reps vs your ${ex.repMin}–${ex.repMax} target`, value: target, weight: 0.2 },
    { key: 'control', label: 'Control & tempo', value: control, weight: 0.2 },
    ...(progress != null ? [{ key: 'progress', label: 'Progress vs last time', value: progress, weight: 0.2 }] : []),
  ];
  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  const score = n ? Math.round((parts.reduce((s, p) => s + p.value * p.weight, 0) / wsum) * 100) / 10 : 0;
  const tone = score >= 9 ? 'great' : score >= 7 ? 'good' : score >= 5 ? 'ok' : 'rough';
  const label = { great: 'Excellent set', good: 'Solid set', ok: 'Decent — room to improve', rough: 'Rough set' }[tone];

  // headline: the main story in plain words
  const bits: string[] = [];
  if (!n) bits.push('No reps were picked up');
  else if (a.romDrop > 0.12) bits.push('Strong start, last reps got shallow');
  else if (cuts >= 2) bits.push('Depth varied from rep to rep');
  else if (range > 0.85 && control > 0.75) bits.push('Clean, consistent reps');
  else if (rushed > 0.4) bits.push('Reps were a bit rushed');
  else bits.push('Good work');
  if (count < ex.repMin && n) bits.push(`short of your ${ex.repMin}+ rep target`);
  else if (progressNote === 'up') bits.push('beat last time');
  const headline = bits.join(', ') + '.';

  // the one thing to do next set
  const loss = n >= 3 ? reps[n - 1].dur / Math.min(...reps.slice(0, 3).map((r) => r.dur)) - 1 : 0.3;
  let next: string;
  if (!n) next = 'Check the phone placement, then try again.';
  else if (count < ex.repMin && range > 0.7) next = `Drop the weight a little so you can hit ${ex.repMin}+ full reps.`;
  else if (a.romDrop > 0.12 || cuts >= 2) next = 'Same weight — stop the set when your depth starts to drop.';
  else if (rushed > 0.4) next = 'Slow down: take about 2 seconds on the way down.';
  else if (count >= ex.repMax && loss < 0.2) next = `You had more in you — add ${fmtW(ex.step)} kg next set.`;
  else if (count >= ex.repMax) next = `Top of your range — try ${fmtW(weight + ex.step)} kg next time.`;
  else next = 'Same weight — go for one more rep.';

  return { score, label, tone, headline, next, parts };
}
