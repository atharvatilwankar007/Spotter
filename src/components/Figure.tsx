import { useEffect, useRef } from 'react';
import type { Recording } from '../lib/pose';

// Faceless 3D mannequin, driven by your own recorded movement (MediaPipe world landmarks, metres).
// Rendered as shaded capsules on a 2D canvas with a slow orbit — no 3D engine needed.

// KP index layout: 0 head, 1 lS, 2 rS, 3 lE, 4 rE, 5 lW, 6 rW, 7 lH, 8 rH, 9 lK, 10 rK, 11 lA, 12 rA
const LIMBS: [number, number, number][] = [
  [1, 3, 0.095], [3, 5, 0.08], [2, 4, 0.095], [4, 6, 0.08],
  [7, 9, 0.135], [9, 11, 0.105], [8, 10, 0.135], [10, 12, 0.105],
];

export function Figure({ rec, size = 150 }: { rec: Recording; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    // loop the first one or two reps
    const r0 = rec.reps[0];
    const r1 = rec.reps[Math.min(1, rec.reps.length - 1)];
    const a = Math.max(0, (r0?.t0 ?? 0) - 0.25);
    const b = (r1?.t1 ?? rec.frames[rec.frames.length - 1]?.t ?? 1) + 0.35;
    const clip = rec.frames.filter((f) => f.t >= a && f.t <= b);
    if (!clip.length) return;
    // fit: height of the body across the clip
    let minY = Infinity;
    let maxY = -Infinity;
    for (const f of clip) for (let i = 0; i < 13; i++) {
      minY = Math.min(minY, f.w[i * 3 + 1]);
      maxY = Math.max(maxY, f.w[i * 3 + 1]);
    }
    const scale = (size * 0.74) / Math.max(0.6, maxY - minY + 0.25);
    const cy = size * 0.5 - ((minY + maxY) / 2) * scale;
    const start = performance.now();
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = (performance.now() - start) / 1000;
      const dur = clip[clip.length - 1].t - clip[0].t || 1;
      const t = clip[0].t + (now % (dur + 0.6));
      const f = clip.find((x) => x.t >= t) ?? clip[clip.length - 1];
      const yaw = 0.6 + Math.sin(now * 0.45) * 0.55;
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const P = (i: number) => {
        const x = f.w[i * 3];
        const y = f.w[i * 3 + 1];
        const z = f.w[i * 3 + 2];
        return { x: size / 2 + (x * cs + z * sn) * scale, y: cy + y * scale, d: -x * sn + z * cs };
      };
      const pts = Array.from({ length: 13 }, (_, i) => P(i));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // floor shadow
      const floorY = Math.max(pts[11].y, pts[12].y) + 6;
      const sh = ctx.createRadialGradient(size / 2, floorY, 2, size / 2, floorY, size * 0.3);
      sh.addColorStop(0, 'rgba(255,106,43,0.28)');
      sh.addColorStop(1, 'rgba(255,106,43,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(size / 2, floorY, size * 0.3, size * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();

      const shade = (d: number) => {
        const k = Math.max(0, Math.min(1, 0.5 + d * 2.2)); // 0 near … 1 far
        const l = 92 - k * 46;
        return `hsl(36 14% ${l}%)`;
      };
      type Item = { d: number; draw: () => void };
      const items: Item[] = [];
      for (const [i, j, r] of LIMBS) {
        const A = pts[i];
        const B = pts[j];
        items.push({
          d: (A.d + B.d) / 2,
          draw: () => {
            ctx.strokeStyle = shade((A.d + B.d) / 2);
            ctx.lineWidth = r * scale;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.stroke();
          },
        });
      }
      // torso as a rounded quad
      const torsoD = (pts[1].d + pts[2].d + pts[7].d + pts[8].d) / 4;
      items.push({
        d: torsoD,
        draw: () => {
          ctx.fillStyle = shade(torsoD - 0.05);
          ctx.strokeStyle = shade(torsoD - 0.05);
          ctx.lineWidth = 0.12 * scale;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[8].x, pts[8].y);
          ctx.lineTo(pts[7].x, pts[7].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        },
      });
      // head: neck point above shoulders, faceless sphere
      const nx = (pts[1].x + pts[2].x) / 2;
      const ny = (pts[1].y + pts[2].y) / 2;
      const hx = nx + (pts[0].x - nx) * 0.9;
      const hy = ny + (pts[0].y - ny) * 0.9;
      items.push({
        d: pts[0].d,
        draw: () => {
          const hr = 0.105 * scale;
          const g = ctx.createRadialGradient(hx - hr * 0.35, hy - hr * 0.4, hr * 0.1, hx, hy, hr);
          g.addColorStop(0, '#fbf7ef');
          g.addColorStop(1, shade(pts[0].d + 0.08));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(hx, hy, hr, 0, Math.PI * 2);
          ctx.fill();
        },
      });
      items.sort((p, q) => q.d - p.d).forEach((it) => it.draw());
      // joints glow on the near side
      ctx.fillStyle = '#ff6a2b';
      for (const i of [3, 4, 9, 10]) {
        const p = pts[i];
        if (p.d > 0.05) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.03 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [rec, size]);

  return <canvas ref={ref} className="figure" style={{ width: size, height: size }} />;
}
