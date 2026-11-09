export const fmtW = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(w * 10 === Math.round(w * 10) ? 1 : 2));
