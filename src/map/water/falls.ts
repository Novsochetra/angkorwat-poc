import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, MeshStandardMaterial, Vector3 } from 'three';
import { CELL } from '../heightfield';
import { NOISE_GLSL } from './glsl';
import type { WaterGrid } from './grid';

/**
 * Waterfall sheets: for every fall of the height field a curtain that rolls
 * over the lip and drops down the cliff face, hugging it (it is pushed out
 * wherever the rock stands forward), and a small curtain on every lower step
 * of a river (1–2 m cascades). One geometry for all of them.
 *
 * Attributes for the shader (`fallMaterial` below):
 *  - `aFall` (across m, along m from the roll start, drop m, seed)
 *  - `aEdge` (alpha across the width: 0 at the dry sides, along m at the lip)
 */

/** Where a fall lands: spray and foam go here. */
export interface FallFoot {
  x: number;
  y: number;
  z: number;
  width: number;
  drop: number;
  /** Flow direction below the fall (unit x, z). */
  dir: [number, number];
  /** Where the sheet leaves the lip (for lip foam). */
  lip: [number, number];
  /** A 1–2 m step of a river, not a real fall. */
  small: boolean;
}

/** How far the water shoots out over the lip: out = ARC · √drop (m). */
const ARC = 0.34;
/** Gap kept between the sheet and the rock (m). */
const CLEAR = 0.3;
/** Length of the roll over the lip, upstream of the face (m). */
const ROLL = 1.4;

export function buildFallGeometry(g: WaterGrid): { geometry: BufferGeometry; feet: FallFoot[] } {
  const f = g.field;
  const pos: number[] = [];
  const fall: number[] = [];
  const edge: number[] = [];
  const index: number[] = [];
  const feet: FallFoot[] = [];

  /** A grid of vertices, `cols` × `rows`, column by column; adds the triangles. */
  const grid = (cols: number, rows: number, vertex: (j: number, r: number) => void) => {
    const base = pos.length / 3;
    for (let j = 0; j < cols; j++) for (let r = 0; r < rows; r++) vertex(j, r);
    for (let j = 0; j < cols - 1; j++)
      for (let r = 0; r < rows - 1; r++) {
        const a = base + j * rows + r;
        const b = a + rows;
        index.push(a, b, b + 1, a, b + 1, a + 1);
      }
  };

  f.falls.forEach((F, fi) => {
    const d = F.dir;
    const side: [number, number] = [-d[1], d[0]];
    const T = F.top;
    const B = F.bottom;
    const H = T - B;
    const du = 0.25;
    const half = F.width / 2 + 2;
    const n = Math.round((2 * half) / du) + 1;
    // Per column across the river: where the rock drops away under the top water.
    const tFace = new Float32Array(n).fill(NaN);
    const ok = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const u = -half + j * du;
      const px = F.x + side[0] * u;
      const pz = F.z + side[1] * u;
      let seen = false;
      for (let t = -5; t <= 9; t += 0.1) {
        const x = px + d[0] * t;
        const z = pz + d[1] * t;
        const lv = g.levelAt(x, z);
        if (lv !== null && Math.abs(lv - T) < 0.5) {
          seen = true;
          continue;
        }
        if (!seen) continue;
        tFace[j] = t;
        ok[j] = f.heightAt(x, z) < T - 1.5 ? 1 : 0;
        break;
      }
    }
    let j0 = n;
    let j1 = -1;
    for (let j = 0; j < n; j++)
      if (ok[j]) {
        j0 = Math.min(j0, j);
        j1 = Math.max(j1, j);
      }
    if (j1 < 0) {
      console.warn(`[map] water: no lip found for the fall of ${F.river} at (${F.x.toFixed(0)}, ${F.z.toFixed(0)})`);
      return;
    }
    // Columns kept: the wet ones and a short fade on each side.
    const pad = 3;
    const c0 = Math.max(0, j0 - pad);
    const c1 = Math.min(n - 1, j1 + pad);
    for (let j = 0; j < n; j++) {
      if (ok[j] && !Number.isNaN(tFace[j])) continue;
      // (dry or missing columns take the face of the nearest wet one)
      let best = j0;
      for (let k = j0; k <= j1; k++) if (ok[k] && Math.abs(k - j) < Math.abs(best - j)) best = k;
      tFace[j] = tFace[best];
    }
    // Sheet line: in front of the face over ±1 m (the face is stepped by the 2 m cells), smoothed.
    const dil = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let m = -Infinity;
      for (let k = Math.max(0, j - 4); k <= Math.min(n - 1, j + 4); k++) m = Math.max(m, tFace[k]);
      dil[j] = m;
    }
    const tSheet = new Float32Array(n);
    const alpha = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let s = 0;
      let a = 0;
      let w = 0;
      for (let k = Math.max(0, j - 2); k <= Math.min(n - 1, j + 2); k++) {
        s += dil[k];
        w++;
      }
      tSheet[j] = Math.max(tFace[j], s / w) + 0.12;
      w = 0;
      for (let k = Math.max(0, j - 3); k <= Math.min(n - 1, j + 3); k++) {
        a += ok[k];
        w++;
      }
      alpha[j] = a / w;
    }
    // Rock face at a height: first point along the flow where the ground is below it.
    const faceAt = (j: number, y: number): number => {
      const u = -half + j * du;
      const px = F.x + side[0] * u;
      const pz = F.z + side[1] * u;
      for (let t = tFace[j] - 0.2; t < tFace[j] + 16; t += 0.1) if (f.heightAt(px + d[0] * t, pz + d[1] * t) < y - 0.05) return t;
      return tFace[j] + 16;
    };
    const rollRows = 4;
    const fallRows = Math.max(8, Math.ceil(H / 0.8));
    const rows = rollRows + fallRows;
    const seed = (fi * 0.618 + 0.21) % 1;
    const dyAt = (k: number) => (H + 0.7) * (k / fallRows) ** 1.5;
    // Profile of every column (distance out along the flow per row): the arc of
    // the water leaving the lip, pushed out where the rock stands forward...
    const out: Float32Array[] = [];
    for (let j = 0; j < n; j++) {
      const o = new Float32Array(fallRows + 1);
      o[0] = tSheet[j];
      if (j >= c0 - 4 && j <= c1 + 4)
        for (let k = 1; k <= fallRows; k++) {
          const dy = dyAt(k);
          o[k] = Math.max(tSheet[j] + ARC * Math.sqrt(dy), faceAt(j, T + 0.04 - dy) + CLEAR);
        }
      out.push(o);
    }
    // ...then the same push for the neighbours over ±1 m (no folds where the
    // stepped rock differs from column to column), smoothed, never moving back in.
    const prof: Float32Array[] = [];
    for (let j = 0; j < n; j++) {
      const o = new Float32Array(fallRows + 1);
      for (let k = 0; k <= fallRows; k++) {
        let s = 0;
        let w = 0;
        for (let jj = Math.max(0, j - 2); jj <= Math.min(n - 1, j + 2); jj++) {
          let m = -Infinity;
          for (let q = Math.max(0, jj - 4); q <= Math.min(n - 1, jj + 4); q++) m = Math.max(m, out[q][k]);
          s += m;
          w++;
        }
        o[k] = Math.max(out[j][k], s / w, k > 0 ? o[k - 1] : -Infinity);
      }
      prof.push(o);
    }
    grid(c1 - c0 + 1, rows, (jj, r) => {
      const j = c0 + jj;
      const u = -half + j * du;
      const px = F.x + side[0] * u;
      const pz = F.z + side[1] * u;
      let t: number;
      let y: number;
      let along: number;
      const lip = prof[j][0];
      const lipLen = lip - (tFace[j] - ROLL);
      if (r < rollRows) {
        t = tFace[j] - ROLL + (lipLen * r) / (rollRows - 1);
        y = T + 0.05;
        along = (lipLen * r) / (rollRows - 1);
      } else {
        const k = r - rollRows + 1;
        const dy = dyAt(k);
        t = prof[j][k];
        y = T + 0.04 - dy;
        // (arc length ≈ drop + the push out)
        along = lipLen + Math.hypot(dy, t - lip);
      }
      pos.push(px + d[0] * t, y, pz + d[1] * t);
      fall.push(u, along, H, seed);
      edge.push(alpha[j], lipLen);
    });
    const mid = Math.round((j0 + j1) / 2);
    const tFoot = out[mid][fallRows];
    const [fx, fz] = g.flowAt(F.x + d[0] * (tFoot + 3), F.z + d[1] * (tFoot + 3));
    const fl = Math.hypot(fx, fz) || 1;
    feet.push({
      x: F.x + d[0] * tFoot,
      y: B,
      z: F.z + d[1] * tFoot,
      width: (j1 - j0) * du,
      drop: H,
      dir: fl > 0.1 ? [fx / fl, fz / fl] : d,
      lip: [F.x + d[0] * tFace[mid], F.z + d[1] * tFace[mid]],
      small: false,
    });
  });

  // Small steps along the rivers (and any drop not covered by a fall sheet).
  const { nx, nz } = f;
  const nearFall = (x: number, z: number) => f.falls.some((F) => Math.hypot(x - F.x, z - F.z) < F.width / 2 + 5);
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      const L = g.level[c];
      if (L < -1000) continue;
      const [cx, cz] = f.cellCenter(i, k);
      for (const [di, dk] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const i2 = i + di;
        const k2 = k + dk;
        if (i2 < 0 || k2 < 0 || i2 >= nx || k2 >= nz) continue;
        const Lm = g.level[i2 + k2 * nx];
        const drop = L - Lm;
        if (Lm < -1000 || drop < 0.5) continue;
        const ex = cx + (di * CELL) / 2;
        const ez = cz + (dk * CELL) / 2;
        if (drop >= 3 && nearFall(ex, ez)) continue;
        // Edge from (ax, az) to (bx, bz), outward (di, dk).
        const ax = ex - (dk * CELL) / 2;
        const az = ez - (di * CELL) / 2;
        // Rows (out from the edge, height): a short roll on the upper water, then down.
        const rows: [number, number][] = [
          [-0.9, L + 0.04],
          [0.06, L + 0.04],
        ];
        const dys = [...new Set([0.25, 0.7, 1.3, drop * 0.7, drop + 0.5])].filter((v) => v <= drop + 0.5).sort((p, q) => p - q);
        for (const dy of dys) rows.push([0.06 + 0.3 * Math.sqrt(dy), L + 0.04 - dy]);
        const seed = ((i * 0.37 + k * 0.73) % 1 + 1) % 1;
        grid(3, rows.length, (j, r) => {
          const s = j / 2;
          const [out, y] = rows[r];
          const x = ax + dk * CELL * s + di * out;
          const z = az + di * CELL * s + dk * out;
          // (across: world position along the edge, so side by side steps line up)
          const across = di !== 0 ? z : x;
          const along = r === 0 ? 0 : 0.96 + Math.max(0, L + 0.04 - y) + (out - 0.06);
          pos.push(x, y, z);
          fall.push(across, along, drop, seed);
          edge.push(1, 0.96);
        });
        const [fx, fz] = g.flowAt(ex + di * 1.5, ez + dk * 1.5);
        const fl = Math.hypot(fx, fz);
        feet.push({ x: ex + di * 0.8, y: Lm, z: ez + dk * 0.8, width: CELL, drop, dir: fl > 0.1 ? [fx / fl, fz / fl] : [di, dk], lip: [ex, ez], small: true });
      }
    }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aFall', new Float32BufferAttribute(fall, 4));
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edge, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, feet };
}

export interface FallUniforms {
  uTime: { value: number };
  /** White of the falling water, and its thin, see-through tint. */
  uWhite: { value: Color };
  uTint: { value: Color };
  /** Glow of the water itself (pale blue at night, so the falls stay visible). */
  uGlow: { value: Color };
  /** Sun or moon light shining through the sheet from behind. */
  uBack: { value: Color };
  uLightDirW: { value: Vector3 };
}

/**
 * Falling water: a lit, see-through white. Streaks run down the sheet and
 * speed up as they fall; the sheet is dense at the lip and in the middle and
 * breaks into strands lower down and at its sides. The roll over the lip
 * turns the river's colour to white.
 */
export function fallMaterial(): { material: MeshStandardMaterial; uniforms: FallUniforms } {
  const uniforms: FallUniforms = {
    uTime: { value: 0 },
    uWhite: { value: new Color() },
    uTint: { value: new Color() },
    uGlow: { value: new Color() },
    uBack: { value: new Color() },
    uLightDirW: { value: new Vector3(0, 1, 0) },
  };
  const material = new MeshStandardMaterial({ roughness: 0.6, metalness: 0, transparent: true, side: DoubleSide, alphaTest: 0.03 });
  material.name = 'waterfalls';
  material.customProgramCacheKey = () => 'map-waterfalls';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFall;\nattribute vec2 aEdge;\nvarying vec4 vFall;\nvarying vec2 vEdge;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vFall = aFall;\n  vEdge = aEdge;\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FALL_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FALL_MAIN}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  float back = pow(max(dot(normalize(vWPos - cameraPosition), uLightDirW), 0.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * (uGlow + uBack * back * (1.0 - 0.5 * diffuseColor.a));`,
      );
  };
  return { material, uniforms };
}

const FALL_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uWhite;
uniform vec3 uTint;
uniform vec3 uGlow;
uniform vec3 uBack;
uniform vec3 uLightDirW;
varying vec4 vFall;
varying vec2 vEdge;
varying vec3 vWPos;
${NOISE_GLSL}
`;

const FALL_MAIN = /* glsl */ `
  {
    float fu = vFall.x;
    float fH = max(vFall.z, 0.5);
    float seed = vFall.w;
    float fd = vFall.y - vEdge.y;
    float fr = clamp(fd / fH, 0.0, 1.0);
    // Streak coordinate: the square root of the fall makes them speed up and stretch as they drop.
    float sc = sqrt(max(fd, 0.0) + 0.5) * 2.4 - uTime * 0.75;
    // Long streaks down the sheet (a little motion in each).
    float s1 = wNoise(vec2(fu * 2.1 + seed * 31.0, sc * 0.22));
    float s2 = wNoise(vec2(fu * 5.3 + seed * 17.0, sc * 0.5 + 5.0));
    float s3 = wNoise(vec2(fu * 11.0 + 3.0, sc * 1.1 + 11.0));
    float st = s1 * 0.45 + s2 * 0.35 + s3 * 0.2;
    // Surges: denser bands that travel down the sheet.
    float surge = wNoise(vec2(seed * 7.0 + fu * 0.12, sc * 0.4));
    // Dense at the lip and in the middle, thinner lower down, breaking into strands near the foot.
    float dens = mix(1.0, 0.6, fr) * (0.8 + 0.35 * surge) * (0.5 + 0.8 * st) * (0.75 + 0.25 * vEdge.x);
    dens *= mix(1.0, smoothstep(0.34, 0.62, st + 0.1 * surge), smoothstep(0.4, 1.0, fr));
    float a = clamp(dens, 0.0, 1.0);
    a = max(a, 0.95 * (1.0 - smoothstep(0.0, 2.2, fd)));
    // White churn where it lands.
    a = max(a, 0.85 * smoothstep(fH - 1.6, fH + 0.2, fd) * smoothstep(0.2, 0.55, s3 + 0.2));
    if (fd < 0.0) {
      // The roll over the lip: river water turning white.
      float roll = smoothstep(-vEdge.y, 0.0, fd);
      a = roll * (0.6 + 0.4 * s2);
    }
    // Frayed sides.
    a *= smoothstep(0.0, 0.5, vEdge.x * (0.5 + s2 + 0.4 * s3));
    float lit = 0.74 + 0.6 * (st - 0.5) + 0.18 * (1.0 - fr);
    vec3 col = mix(uTint, uWhite, smoothstep(0.1, 0.8, a)) * lit;
    diffuseColor = vec4(col, a);
  }
`;
