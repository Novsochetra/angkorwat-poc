import { Vector3, type Camera } from 'three';
import type { HeightField } from '../heightfield';
import { burstAt, showScript, type BurstKind } from './show';

/**
 * How the show reads from a camera (a shot's `fwstats=1`: fireworks.ts calls it once, with the shot's camera): over the
 * whole show, second by second, how many bursts glow in the picture at once and how big they are on it (their
 * diameter as a share of the frame's height), and how many the land hides (their middle behind the hill seen from
 * the camera). Exact from the script: no picture is read. A console line `[map] fireworks on screen …`.
 */

/** How long a burst counts as seen after it bursts (s: its sparks bright and full, about 0.6 of their life: what a still picture shows as a burst). */
const SEEN: Record<BurstKind, number> = { peony: 1.75, chrysanthemum: 2.0, willow: 3, crackle: 1.0, ring: 1.7, palm: 2.3, comet: 1.0, angkor: 3.5 };
/** The forest on the hill over the land's top (m), for the line of sight. */
const CANOPY = 6;

const ACTS: readonly [string, number, number][] = [
  ['opening 10‥70', 10, 70],
  ['colours 70‥180', 70, 180],
  ['layers 180‥290', 180, 290],
  ['build 290‥400', 290, 400],
  ['lull 400‥425', 400, 425],
  ['finale 425‥466', 425, 466],
];
const AT = [10, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420, 440, 450, 458, 464];

export function logShowStats(camera: Camera, field: HeightField, label: string, life: Record<BurstKind, number>, smokeLife: number): void {
  const script = showScript();
  // (the busiest second for the data texture's lines: rockets in the air with their smoke (medium, high), and without
  // it on low near each site (the other site's small low ones left out), as fireworks.ts `inTheAir` counts them)
  const busiest = (smoke: boolean, near: 'kulen' | 'lake' | null): string => {
    let most = 0;
    let at = 0;
    for (let s = 0; s < 480; s += 0.25) {
      let n = 0;
      for (const r of script) {
        if (r.t > s || (near && r.close && r.site !== near)) continue;
        if (s < burstAt(r) + (smoke ? Math.max(smokeLife, life[r.kind]) : life[r.kind])) n++;
      }
      if (n > most) {
        most = n;
        at = s;
      }
    }
    return `${most} at ${at} s`;
  };
  console.info(`[map] fireworks in the air at most: with smoke ${busiest(true, null)}; on low near Kulen ${busiest(false, 'kulen')}, near the lake ${busiest(false, 'lake')} (both sites; drawn: those not behind the camera)`);
  camera.updateMatrixWorld();
  const cam = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const p = new Vector3();
  const q = new Vector3();
  /** The land (and its forest) stands between the camera and (x, y, z). */
  const hidden = (x: number, y: number, z: number): boolean => {
    const d = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
    for (let s = 8; s < d - 4; s += 4) {
      const k = s / d;
      const px = cam.x + (x - cam.x) * k;
      const pz = cam.z + (z - cam.z) * k;
      const h = field.heightAt(px, pz);
      if (h + (h > 12 ? CANOPY : 0) > cam.y + (y - cam.y) * k) return true;
    }
    return false;
  };
  type Seen = { n: number; hid: number; sizes: number[] };
  const at = (s: number): Seen => {
    const out: Seen = { n: 0, hid: 0, sizes: [] };
    for (const r of script) {
      if (r.kind === 'comet') continue;
      const tau = s - burstAt(r);
      if (tau < 0 || tau > SEEN[r.kind]) continue;
      p.set(r.bx, r.by, r.bz).project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) continue;
      q.set(r.bx, r.by, r.bz).addScaledVector(up, r.size).project(camera);
      if (hidden(r.bx, r.by, r.bz)) {
        out.hid++;
        continue;
      }
      out.n++;
      out.sizes.push(Math.abs(q.y - p.y));
    }
    return out;
  };
  const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);
  const lines: string[] = [];
  for (const [name, a, b] of ACTS) {
    let n = 0;
    let hid = 0;
    let most = 0;
    const sizes: number[] = [];
    let k = 0;
    for (let s = a; s < b; s += 0.5, k++) {
      const v = at(s);
      n += v.n;
      hid += v.hid;
      most = Math.max(most, v.n);
      sizes.push(...v.sizes);
    }
    lines.push(`${name}: ${(n / k).toFixed(1)} on screen (most ${most}), ${(hid / k).toFixed(1)} hidden, size ${(med(sizes) * 100).toFixed(0)} %`);
  }
  const times = AT.map((s) => {
    const v = at(s);
    return `${s}s ${v.n}${v.hid ? `(+${v.hid} hid)` : ''} ${(med(v.sizes) * 100).toFixed(0)}%`;
  });
  // (the land's skyline seen from the camera: its height (°) by bearing (° right of north), the forest on it)
  const ridge: string[] = [];
  for (let b = -40; b <= 280; b += 5) {
    let best = -90;
    const sx = Math.sin((b * Math.PI) / 180);
    const sz = -Math.cos((b * Math.PI) / 180);
    for (let d = 10; d < 900; d += 4) {
      const h = field.heightAt(cam.x + sx * d, cam.z + sz * d);
      best = Math.max(best, (Math.atan2(h + (h > 12 ? CANOPY : 0) - cam.y, d) * 180) / Math.PI);
    }
    ridge.push(`${b}:${best.toFixed(0)}`);
  }
  console.info(`[map] fireworks: the skyline from ${label} (bearing°:elevation°) ${ridge.join(' ')}`);
  console.info(`[map] fireworks on screen (${label}; diameter / frame height, median): ${lines.join(' · ')} || ${times.join(', ')}`);
}

