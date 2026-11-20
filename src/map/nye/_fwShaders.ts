/**
 * The fireworks' shaders (fireworks.ts): every spark, trail, flash, glow and puff of smoke placed in the vertex
 * shader from its rocket's row in the data texture and the show's time, nothing per spark on the CPU. Kinds are
 * tables (`KA`, `KB`, `KC`, indexed by the kind), never chains of `if` (shaders of slow drivers compile quickly:
 * CLAUDE.md, commit b250279).
 *
 * The data texture (`uData`, RGBA float, `ROW` texels a rocket, a rocket a line):
 *  0: burst point xyz, burst time (s into the show)
 *  1: launch point xyz, rise (s)
 *  2: colour (linear rgb), kind (`KIND_INDEX`)
 *  3: second colour (linear rgb), burst radius (m)
 *  4: seed (0‥1), sparks it has at this graphics level, glitter (0 / 1), its light's power (show.ts `burstLight`)
 */

/** Texels a rocket. */
export const ROW = 5;

/** The kinds' order in the shader's tables. */
export const KIND_INDEX = { peony: 0, chrysanthemum: 1, willow: 2, crackle: 3, ring: 4 } as const;

/**
 * The ribbon every spark, trail and halo is drawn with: `SEGS` steps along its length (a willow's trail bends as
 * it droops) and a round cap at each end; per vertex (side −1 / 1, s 0 tail ‥ 1 head, cap −1 / 0 / 1).
 */
export const SEGS = 4;

const COMMON = /* glsl */ `
  uniform sampler2D uData;
  uniform float uTime;
  vec4 rk(int slot, int c) { return texelFetch(uData, ivec2(c, slot), 0); }
  float hash(float a, float b) { return fract(sin(a * 12.9898 + b * 78.233) * 43758.5453); }
  // Light of a burst tau s after it (as show.ts burstLight), its power p, a willow's (w 1) lasting.
  float burstLight(float p, float w, float tau) {
    return tau < 0.0 ? 0.0 : p * (0.75 * exp(-tau / 0.09) + 0.35 * exp(-tau / 0.7) + w * 0.35 * exp(-tau / 2.6));
  }
`;

/** The sky's sparks and halos: `uMode` 0 the sparks (`uPer` a rocket, from line `uFirst`), 1 the four halos a rocket. */
export const SKY_VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  ${COMMON}
  uniform float uMode;
  uniform float uPer;
  uniform float uFirst;
  // Smoke drawn (1) or not (0: low).
  uniform float uSmoke;
  // The scene's height (px), the pixel size's scale (pxscale=), the sparks' brightness for their count, the night.
  uniform vec4 uView;
  // Light now (lamps): where (xyz) and its colour times its strength.
  uniform vec4 uLightPos[2];
  uniform vec4 uLightCol[2];
  varying vec3 vCol;
  varying vec2 vQ;
  varying float vSoft;

  // Per kind (peony, chrysanthemum, willow, crackle, ring):
  // KA: drag (1/s), gravity (share of g), life (s), trail (s)
  const vec4 KA[5] = vec4[5](vec4(2.6, 1.0, 2.4, 0.13), vec4(2.2, 1.0, 2.9, 0.5), vec4(1.3, 1.7, 6.4, 1.8), vec4(3.4, 0.5, 1.7, 0.07), vec4(2.6, 0.7, 2.4, 0.15));
  // KB: width (m), brightness, embers from (share of life), speed spread
  const vec4 KB[5] = vec4[5](vec4(0.6, 2.6, 0.55, 0.07), vec4(0.5, 2.2, 0.45, 0.1), vec4(0.4, 0.72, 0.5, 0.3), vec4(0.4, 1.3, 0.95, 0.6), vec4(0.6, 2.6, 0.55, 0.04));
  // KC: a ring (1), crackles (1), flicker, a trail's tail brightness
  const vec4 KC[5] = vec4[5](vec4(0.0, 0.0, 0.12, 0.25), vec4(0.0, 0.0, 0.3, 0.12), vec4(0.0, 0.0, 0.25, 0.04), vec4(0.0, 1.0, 0.0, 0.3), vec4(1.0, 0.0, 0.12, 0.25));
  // KD: how quickly it fades (the brightness's power of the life left)
  const float KD[5] = float[5](1.4, 1.2, 0.7, 1.0, 1.4);
  const vec3 EMBER = vec3(1.0, 0.3, 0.06);
  const vec3 G = vec3(0.0, 9.8, 0.0);

  // A spark: from the burst point b, at speed v0 (m/s) with drag k and gravity g, t s after the burst.
  vec3 spark(vec3 b, vec3 v0, float k, float g, float t) {
    float e = (1.0 - exp(-k * t)) / k;
    return b + v0 * e - vec3(0.0, g * (t - e) / k, 0.0);
  }
  vec3 sparkV(vec3 v0, float k, float g, float t) {
    float e = exp(-k * t);
    return (v0 + vec3(0.0, g / k, 0.0)) * e - vec3(0.0, g / k, 0.0);
  }
  // The shell climbing from l to b in rise s (slowing to a stop at the top), t s after launch.
  vec3 climb(vec3 l, vec3 b, float rise, float t) {
    float s = clamp(t / rise, 0.0, 1.0);
    return mix(l, b, 1.0 - (1.0 - s) * (1.0 - s));
  }

  void main() {
    int per = int(uPer + 0.5);
    int slot = int(uFirst + 0.5) + gl_InstanceID / per;
    int j = gl_InstanceID - (gl_InstanceID / per) * per;
    vec4 d0 = rk(slot, 0);
    vec4 d1 = rk(slot, 1);
    vec4 d2 = rk(slot, 2);
    vec4 d3 = rk(slot, 3);
    vec4 d4 = rk(slot, 4);
    vec3 b = d0.xyz;
    float tau = uTime - d0.w;
    int kind = int(d2.w + 0.5);
    vec4 ka = KA[kind];
    vec4 kb = KB[kind];
    vec4 kc = KC[kind];
    float size = d3.w;
    float seed = d4.x;
    float fj = float(j);
    float side = position.x;
    float s = position.y;
    float cap = position.z;

    vec3 p;        // this vertex's point on its path (world)
    vec3 v;        // the path's way there (for the ribbon's direction on screen)
    float width;   // m across
    float minPx;   // at least this many pixels across
    vec3 col;
    float hide;

    if (uMode < 0.5) {
      // ── A spark: its way out from the burst (an even shell, a ring in a tilted plane), its speed, then flight.
      float n = max(d4.y, 1.0);
      float y = 1.0 - 2.0 * (fj + 0.5) / n;
      float rr = sqrt(max(0.0, 1.0 - y * y));
      float ph = fj * 2.3999632 + seed * 6.2831853;
      vec3 dir = vec3(cos(ph) * rr, y, sin(ph) * rr);
      float ra = fj * 6.2831853 / n + seed * 31.0;
      float tilt = 0.5 + 0.8 * hash(seed, 3.0);
      vec3 ru = vec3(cos(seed * 50.0), 0.0, sin(seed * 50.0));
      vec3 rv = normalize(cross(ru, vec3(0.0, 1.0, 0.0))) * sin(tilt) + vec3(0.0, cos(tilt), 0.0);
      vec3 ring = cos(ra) * ru + sin(ra) * rv;
      float h1 = hash(fj + 1.0, seed * 97.0);
      float h2 = hash(fj + 7.0, seed * 31.0);
      vec3 jit = (vec3(h1, h2, hash(h1, h2)) - 0.5) * 0.12;
      dir = normalize(mix(dir, ring, kc.x) + jit);
      float k = ka.x;
      float g = 9.8 * ka.y;
      float life = ka.z * (0.85 + 0.3 * h2);
      vec3 v0 = dir * size * k * (1.0 - kb.w * h1);
      // (the trail: this vertex is that many seconds behind the head, never before the burst)
      float tv = max(tau - (1.0 - s) * ka.w, 0.0);
      p = spark(b, v0, k, g, tv);
      v = sparkV(v0, k, g, tv);
      float u = clamp(tau / life, 0.0, 1.0);
      // Colour: its own, turning to the second, then gold-to-ember as it dies; the tail of a trail warmer.
      col = mix(d2.rgb, d3.rgb, smoothstep(0.25, 0.6, u));
      col = mix(col, EMBER * 0.7, smoothstep(kb.z, 1.0, u));
      col = mix(col, EMBER, (1.0 - s) * 0.45);
      float bright = kb.y * pow(1.0 - u, KD[kind]) * (1.0 + 1.6 * exp(-tau / 0.12));
      // (flicker; glitter strobes as it fades)
      float fl = 1.0 - kc.z + kc.z * hash(floor(uTime * 24.0), fj + seed * 13.0);
      float strobe = step(0.45, fract(uTime * 11.0 + h1 * 13.0)) * 1.9;
      bright *= fl * mix(1.0, strobe, d4.z * smoothstep(0.3, 0.45, u));
      // Crackles: dim gold glitter, then each pops white at its own moment and is gone.
      float tp = life * (0.45 + 0.5 * h2);
      float pop = step(tp, tau) * exp(-max(tau - tp, 0.0) / 0.045);
      bright = mix(bright, (0.35 * fl + 6.0 * pop) * step(tau, tp + 0.2), kc.y);
      col = mix(col, mix(col, vec3(1.0, 0.95, 0.85), pop), kc.y);
      // (along a trail: the head brightest)
      bright *= mix(kc.w, 1.0, pow(s, 1.6));
      width = kb.x * (1.0 + 2.5 * pop * kc.y);
      minPx = 1.9;
      col *= bright * uView.z;
      hide = float(tau < 0.0 || tau > life || fj >= n);
    } else {
      // ── The halos: 0 the shell climbing on its trail, 1 the white flash of the burst, 2 its glow in the air
      // round it (the haze lit), 3 its smoke, lit by the bursts after it. A table by j, no branches.
      vec4 oh = vec4(equal(ivec4(j), ivec4(0, 1, 2, 3)));
      float rise = d1.w;
      float tl = tau + rise;
      float tv = max(tl - (1.0 - s) * 0.55, 0.0);
      vec3 head = climb(d1.xyz, b, rise, tv);
      vec3 smokeAt = b + vec3(0.6, 0.35, 0.25) * tau - vec3(0.0, size * 0.15, 0.0);
      p = oh.x * head + oh.y * b + oh.z * b + oh.w * smokeAt;
      v = oh.x * (b - d1.xyz) + vec3(0.0, 1.0, 0.0) * (1.0 - oh.x);
      // (the halos are still: the ribbon is a square round its point, its length nothing)
      float fl = 0.75 + 0.25 * hash(floor(uTime * 30.0), seed * 7.0);
      vec3 shell = vec3(1.0, 0.78, 0.45) * 1.6 * fl * mix(0.1, 1.0, pow(s, 2.0)) * (0.6 + 0.4 * smoothstep(0.0, 0.3, tl));
      vec3 flash = mix(d2.rgb, vec3(1.0), 0.65) * 4.0 * exp(-max(tau, 0.0) / 0.06);
      float lp = burstLight(d4.w, float(kind == 2), tau);
      vec3 glow = d2.rgb * 0.13 * lp / max(d4.w, 1e-3);
      // smoke: its own faint grey under the moon, and the light of the bursts now near it
      vec3 lit = vec3(0.004, 0.005, 0.008) * uView.w;
      for (int i = 0; i < 2; i++) {
        float dl = length(uLightPos[i].xyz - smokeAt) / 70.0;
        lit += uLightCol[i].rgb * 0.035 / (1.0 + dl * dl);
      }
      vec3 smoke = lit * smoothstep(0.2, 1.4, tau) * (1.0 - smoothstep(5.0, 9.0, tau));
      col = oh.x * shell + oh.y * flash + oh.z * glow + oh.w * smoke;
      width = dot(oh, vec4(0.42, size * 0.3 * (1.0 + 4.0 * max(tau, 0.0)), size * 2.0, size * (0.75 + 0.08 * tau)));
      minPx = dot(oh, vec4(1.6, 3.0, 4.0, 4.0));
      vSoft = dot(oh, vec4(3.0, 3.5, 2.6, 2.2));
      // (when each shows: the shell while it climbs; the flash 0.4 s; the glow 3.5 s; the smoke 9 s, not on low)
      vec2 span = oh.x * vec2(-rise, 0.0) + oh.y * vec2(0.0, 0.4) + oh.z * vec2(0.0, 3.5) + oh.w * vec2(0.2, 9.0 * uSmoke);
      hide = float(tau < span.x || tau > span.y);
    }
    vSoft = uMode < 0.5 ? 2.4 : vSoft;

    // The ribbon on screen: across the path's direction, round caps at both ends; at least minPx wide.
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    vec4 c0 = projectionMatrix * mvPosition;
    vec4 c1 = projectionMatrix * (viewMatrix * vec4(p + normalize(v + vec3(0.0, 1e-4, 0.0)), 1.0));
    float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
    vec2 sd = c1.xy / max(c1.w, 1e-3) - c0.xy / max(c0.w, 1e-3);
    sd.x *= aspect;
    sd = length(sd) > 1e-6 ? normalize(sd) : vec2(0.0, 1.0);
    float px = width * 0.5 * uView.x * projectionMatrix[1][1] / max(c0.w, 1e-3);
    float lo = minPx * uView.y;
    // (thinner than that: drawn that wide, as bright in all)
    col *= clamp(px / lo, 0.2, 1.0);
    px = max(px, lo) * 0.5;
    vec2 off = (vec2(-sd.y, sd.x) * side + sd * cap) * px * 2.0 / uView.x;
    off.x /= aspect;
    gl_Position = c0;
    gl_Position.xy += off * c0.w;
    vCol = col;
    vQ = vec2(side, cap);
    #include <fog_vertex>
    if (hide > 0.5 || c0.w < 0.5 || dot(col, col) < 1e-8) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

export const SKY_FRAGMENT = /* glsl */ `
  #include <fog_pars_fragment>
  varying vec3 vCol;
  varying vec2 vQ;
  varying float vSoft;
  void main() {
    float r2 = dot(vQ, vQ);
    float a = (exp(-vSoft * r2) + 0.8 * exp(-vSoft * 5.0 * r2)) * (1.0 - smoothstep(0.75, 1.0, r2));
    vec3 col = vCol * a;
    #ifdef USE_FOG
      // (into the haze with distance: fading, not tinted; bright lights carry far)
      col *= 1.0 - 0.7 * hazeDistance(length(vFogWorld - cameraPosition));
    #endif
    if (max(col.r, max(col.g, col.b)) < 0.002) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The water's reflections: a quad per (rocket, stretch of water), the burst's light where the water mirrors it. */
export const WATER_VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  ${COMMON}
  uniform float uSpots;
  // Each stretch of water: a segment (x0, z0, x1, z1) and (half width, water level, -, -).
  uniform vec4 uSpotA[12];
  uniform vec4 uSpotB[12];
  uniform float uNight;
  varying vec3 vCol;
  varying vec2 vUv;
  varying vec4 vSeg;
  varying float vHalf;
  varying vec2 vXZ;
  varying float vSeed;

  float segDist(vec2 p, vec4 sg) {
    vec2 a = sg.xy;
    vec2 ab = sg.zw - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    return length(p - a - ab * t);
  }

  void main() {
    int ns = int(uSpots + 0.5);
    int slot = gl_InstanceID / ns;
    int k = gl_InstanceID - slot * ns;
    vec4 d0 = rk(slot, 0);
    vec4 d2 = rk(slot, 2);
    vec4 d3 = rk(slot, 3);
    vec4 d4 = rk(slot, 4);
    vec4 sa = uSpotA[k];
    vec4 sb = uSpotB[k];
    float level = sb.y;
    vec3 c = cameraPosition;
    // Where the water mirrors the burst: the line from the eye to its mirror image crosses the water.
    vec3 m = vec3(d0.x, 2.0 * level - d0.y, d0.z);
    float t = (c.y - level) / max(c.y - m.y, 1e-3);
    vec3 at = c + (m - c) * t;
    float tau = uTime - d0.w;
    float lp = burstLight(d4.w, float(int(d2.w + 0.5) == 2), tau);
    vec2 toCam = c.xz - at.xz;
    float dc = max(length(toCam), 1e-3);
    vec2 dir = toCam / dc;
    vec2 sideV = vec2(-dir.y, dir.x);
    float r = d3.w * length(at - c) / max(length(m - c), 1e-3);
    float sinA = (c.y - level) / max(length(at - c), 1e-3);
    // (seen low over it, stretched towards the eye by the ripples)
    float len = clamp(r / max(sinA, 0.08) * 0.9, 1.5, 45.0);
    float wid = r * 0.7 + 0.4;
    vec2 xz = at.xz + dir * (position.y * len) + sideV * (position.x * 2.0 * wid);
    vec4 mvPosition = viewMatrix * vec4(xz.x, level + 0.12, xz.y, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vCol = mix(d2.rgb, vec3(1.0), 0.25) * lp * 0.9 * (0.4 + 0.6 * uNight);
    vUv = position.xy * 2.0;
    vSeg = sa;
    vHalf = sb.x;
    vXZ = xz;
    vSeed = d4.x;
    #include <fog_vertex>
    float far = segDist(at.xz, sa) - sb.x - len;
    if (c.y < level + 0.2 || t <= 0.0 || far > 0.0 || lp < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

export const WATER_FRAGMENT = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  varying vec3 vCol;
  varying vec2 vUv;
  varying vec4 vSeg;
  varying float vHalf;
  varying vec2 vXZ;
  varying float vSeed;
  void main() {
    vec2 a = vSeg.xy;
    vec2 ab = vSeg.zw - a;
    float t = clamp(dot(vXZ - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float inside = 1.0 - smoothstep(vHalf - 1.5, vHalf, length(vXZ - a - ab * t));
    float along = vUv.y;
    float across = vUv.x;
    float ripple = 0.55 + 0.45 * sin(along * 23.0 - uTime * 2.1 + vSeed * 40.0) * sin(along * 9.0 + across * 3.0 + uTime * 0.9);
    float shape = exp(-across * across * 2.5) * (1.0 - along * along);
    vec3 col = vCol * shape * ripple * inside;
    #ifdef USE_FOG
      col *= 1.0 - 0.8 * hazeDistance(length(vFogWorld - cameraPosition));
    #endif
    if (max(col.r, max(col.g, col.b)) < 0.002) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;
