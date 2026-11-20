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
 *  4: seed (0‥1), sparks it has at this graphics level, flags (1 glitter + 2 crossette), its light's power (show.ts `burstLight`)
 *  5: the point it faces (x, z: the signature's picture turns to it), -, -
 *
 * The signature's picture (`uShape`, RGBA float, `uShapeN` texels in a line): _fwAngkor.ts `angkorShape`.
 */

/** Texels a rocket. */
export const ROW = 6;

/** The kinds' order in the shader's tables. */
export const KIND_INDEX = { peony: 0, chrysanthemum: 1, willow: 2, crackle: 3, ring: 4, palm: 5, comet: 6, angkor: 7 } as const;

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
  // How much of a willow's lasting light each kind has (show.ts burstLight's tail).
  const float KL[8] = float[8](0.0, 0.0, 1.0, 0.0, 0.0, 0.6, 0.0, 1.0);
  // Light of a burst tau s after it (as show.ts burstLight), its power p, its lasting share w (KL).
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
  // The signature's picture: its points (x, y, outline, tower), how many.
  uniform sampler2D uShape;
  uniform float uShapeN;
  varying vec3 vCol;
  varying vec2 vQ;
  varying float vSoft;

  // Per kind (peony, chrysanthemum, willow, crackle, ring, palm, comet, angkor):
  // KA: drag (1/s), gravity (share of g), life (s), trail (s)
  const vec4 KA[8] = vec4[8](vec4(2.6, 1.0, 2.4, 0.13), vec4(2.2, 1.0, 2.9, 0.5), vec4(1.3, 1.7, 6.4, 1.8), vec4(3.4, 0.5, 1.7, 0.07), vec4(2.6, 0.7, 2.4, 0.15),
    vec4(1.5, 1.4, 3.9, 1.1), vec4(2.0, 0.35, 1.7, 0.12), vec4(4.5, 0.9, 4.6, 0.3));
  // KB: width (m), brightness, embers from (share of life), speed spread
  const vec4 KB[8] = vec4[8](vec4(0.6, 2.6, 0.55, 0.07), vec4(0.5, 2.2, 0.45, 0.1), vec4(0.4, 0.72, 0.5, 0.3), vec4(0.4, 1.3, 0.95, 0.6), vec4(0.6, 2.6, 0.55, 0.04),
    vec4(1.0, 2.0, 0.55, 0.0), vec4(0.5, 1.9, 0.5, 0.25), vec4(1.3, 3.0, 0.7, 0.0));
  // KC: a ring (1), crackles (1), flicker, a trail's tail brightness
  const vec4 KC[8] = vec4[8](vec4(0.0, 0.0, 0.12, 0.25), vec4(0.0, 0.0, 0.3, 0.12), vec4(0.0, 0.0, 0.25, 0.04), vec4(0.0, 1.0, 0.0, 0.3), vec4(1.0, 0.0, 0.12, 0.25),
    vec4(0.0, 0.0, 0.15, 0.2), vec4(0.0, 0.0, 0.65, 0.3), vec4(0.0, 0.0, 0.1, 0.4));
  // KD: how quickly it fades (the brightness's power of the life left)
  const float KD[8] = float[8](1.4, 1.2, 0.7, 1.0, 1.4, 0.8, 1.0, 0.55);
  // KE: arms (1: a palm's few thick arms), shed (1: a comet's tail, shed as it climbs), picture (1: the signature's
  // points), held (s before gravity takes it: the picture stays crisp)
  const vec4 KE[8] = vec4[8](vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(1.0, 0.0, 0.0, 0.0), vec4(0.0, 1.0, 0.0, 0.0), vec4(0.0, 0.0, 1.0, 1.25));
  // KF: the climbing shell's look: width (m), its trail (s), its own colour (share, else warm white), brightness
  const vec4 KF[8] = vec4[8](vec4(0.42, 0.55, 0.0, 1.0), vec4(0.42, 0.55, 0.0, 1.0), vec4(0.42, 0.55, 0.0, 1.0), vec4(0.42, 0.55, 0.0, 1.0), vec4(0.42, 0.55, 0.0, 1.0),
    vec4(1.1, 0.9, 0.15, 1.7), vec4(1.7, 0.3, 0.8, 2.6), vec4(0.8, 0.8, 0.0, 1.5));
  const vec3 EMBER = vec3(1.0, 0.3, 0.06);
  // A crossette's pieces: white gold.
  const vec3 POP = vec3(1.0, 0.9, 0.68);
  const vec3 G = vec3(0.0, 9.8, 0.0);

  // A spark: from b, at speed v0 (m/s) with drag k and gravity g, t s after it left (gravity pulling for tg s of them).
  vec3 spark(vec3 b, vec3 v0, float k, float g, float t, float tg) {
    float e = (1.0 - exp(-k * t)) / k;
    float eg = (1.0 - exp(-k * tg)) / k;
    return b + v0 * e - vec3(0.0, g * (tg - eg) / k, 0.0);
  }
  vec3 sparkV(vec3 v0, float k, float g, float t, float tg) {
    return v0 * exp(-k * t) - vec3(0.0, g / k * (1.0 - exp(-k * tg)), 0.0);
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
    vec4 d5 = rk(slot, 5);
    vec3 b = d0.xyz;
    float tau = uTime - d0.w;
    int kind = int(d2.w + 0.5);
    vec4 ka = KA[kind];
    vec4 kb = KB[kind];
    vec4 kc = KC[kind];
    vec4 ke = KE[kind];
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
      // ── A spark: its way out from the burst (an even shell, a ring in a tilted plane, a palm's arms, a comet's
      // tail, the signature's picture), its speed, then flight. Kinds by their tables' weights, never branches.
      float n = max(d4.y, 1.0);
      // (a crossette: a quarter of them are stars, each popping into four pieces late in its life: pj its star)
      float cr = floor(d4.z * 0.5 + 0.01);
      float glit = d4.z - 2.0 * cr;
      float nP = max(floor(n / (1.0 + 3.0 * cr)), 1.0);
      float pj = fj - floor(fj / nP) * nP;
      float piece = floor(fj / nP);
      float y = 1.0 - 2.0 * (pj + 0.5) / nP;
      float rr = sqrt(max(0.0, 1.0 - y * y));
      float ph = pj * 2.3999632 + seed * 6.2831853;
      vec3 dir = vec3(cos(ph) * rr, y, sin(ph) * rr);
      float ra = pj * 6.2831853 / nP + seed * 31.0;
      float tilt = 0.5 + 0.8 * hash(seed, 3.0);
      vec3 ru = vec3(cos(seed * 50.0), 0.0, sin(seed * 50.0));
      vec3 rv = normalize(cross(ru, vec3(0.0, 1.0, 0.0))) * sin(tilt) + vec3(0.0, cos(tilt), 0.0);
      vec3 ring = cos(ra) * ru + sin(ra) * rv;
      float h1 = hash(pj + 1.0, seed * 97.0);
      float h2 = hash(pj + 7.0, seed * 31.0);
      vec3 jit = (vec3(h1, h2, hash(h1, h2)) - 0.5) * 0.12;
      // (a palm: 6‥9 arms fanned up and out, its stars strung along each at falling speeds: a thick arm)
      float arms = 6.0 + floor(hash(seed, 5.0) * 4.0);
      float arm = pj - floor(pj / arms) * arms;
      float along = floor(pj / arms) / max(floor(nP / arms), 1.0);
      float az = arm * 6.2831853 / arms + seed * 6.2831853 + (hash(arm, seed * 11.0) - 0.5) * 0.4;
      float el = mix(0.12, 1.1, hash(arm + 3.0, seed * 17.0));
      vec3 armDir = vec3(cos(az) * cos(el), sin(el), sin(az) * cos(el));
      dir = normalize(mix(mix(dir, ring, kc.x) + jit, armDir + jit * 0.35, ke.x));
      float k = ka.x;
      float g = 9.8 * ka.y;
      float life = ka.z * (0.85 + 0.3 * h2);
      vec3 v0 = dir * size * k * mix(1.0 - kb.w * h1, 1.0 - 0.45 * along, ke.x);
      // (the signature: spark j to point j·N/n of the picture, turned to face d5.xy, a stroke on to the next point)
      float N = max(uShapeN, 1.0);
      float i0 = min(floor(fj * N / n), N - 1.0);
      float i1 = min(floor((fj + 1.0) * N / n), N - 1.0);
      vec4 P0 = texelFetch(uShape, ivec2(int(i0), 0), 0) * ke.z;
      vec4 P1 = texelFetch(uShape, ivec2(int(i1), 0), 0) * ke.z;
      vec2 toF = normalize(d5.xy - b.xz + vec2(0.0, 1e-3));
      vec3 right = vec3(toF.y, 0.0, -toF.x);
      vec3 T0 = (right * P0.x + vec3(0.0, P0.y, 0.0)) * size;
      vec3 seg = (right * (P1.x - P0.x) + vec3(0.0, P1.y - P0.y, 0.0)) * size * step(abs(P1.z - P0.z), 0.5) * 0.85;
      v0 = mix(v0, (T0 + jit * size * 0.04) * k, ke.z);
      // (a comet: most of its sparks shed from it as it climbs, slow, glittering; the rest a tiny pop at the top)
      float shed = ke.y * step(fj + 0.5, n * 0.8);
      float ts = d1.w * min((fj + 0.5) / (n * 0.8), 1.0) * 0.97;
      vec3 o = mix(b, climb(d1.xyz, b, d1.w, ts), shed);
      v0 = mix(v0, (vec3(h1, h2, hash(h2, h1)) - 0.5) * 5.0 - vec3(0.0, 1.5, 0.0), shed);
      float tl = tau - shed * (ts - d1.w);
      // (the trail: this vertex is that many seconds behind the head, never before it left)
      float tv = max(tl - (1.0 - s) * ka.w, 0.0);
      // (a crossette's star flies to its pop, its piece on from there)
      float tp = mix(1e4, ka.z * (0.6 + 0.1 * hash(pj, seed * 5.0)), cr);
      float ta = min(tv, tp);
      float tb = max(tv - tp, 0.0);
      float tg = max(ta - ke.w, 0.0);
      vec3 pa = spark(o, v0, k, g, ta, tg);
      vec3 va = sparkV(v0, k, g, ta, tg);
      float pz = piece * 1.7 + pj * 0.37;
      vec3 vc = normalize(vec3(hash(pz, seed) - 0.5, hash(pz, 2.0 + seed) - 0.4, hash(pz, 4.0 + seed) - 0.5)) * size * 0.6 + va * 0.3;
      vec3 pb = spark(vec3(0.0), vc, 3.2, 4.9, tb, tb) * cr;
      // (the picture held: each spark a stroke to the next point, growing with it; gone as it starts to droop)
      float held = ke.z * (1.0 - smoothstep(ke.w, ke.w + 0.6, tl));
      float grow = 1.0 - exp(-k * tv);
      p = pa + pb + seg * (1.0 - s) * held * grow;
      float popped = cr * step(tp, tl);
      v = mix(mix(va, sparkV(vc, 3.2, 4.9, tb, tb), popped), -seg, held * step(1e-4, dot(seg, seg)));
      float u = clamp(tl / life, 0.0, 1.0);
      // Colour: its own, turning to the second, then gold-to-ember as it dies; the tail of a trail warmer. The
      // signature: its towers the first colour, its lotus the second.
      col = mix(mix(d2.rgb, d3.rgb, smoothstep(0.25, 0.6, u)), mix(d3.rgb, d2.rgb, P0.w), ke.z);
      col = mix(col, EMBER * 0.7, smoothstep(kb.z, 1.0, u));
      col = mix(col, EMBER, (1.0 - s) * 0.45 * (1.0 - held));
      float bright = kb.y * pow(1.0 - u, KD[kind]) * (1.0 + 1.6 * exp(-tl / 0.12));
      // (flicker; glitter strobes as it fades)
      float fl = 1.0 - kc.z + kc.z * hash(floor(uTime * 24.0), fj + seed * 13.0);
      float strobe = step(0.45, fract(uTime * 11.0 + h1 * 13.0)) * 1.9;
      bright *= fl * mix(1.0, strobe, glit * smoothstep(0.3, 0.45, u));
      // Crackles: dim gold glitter, then each pops white at its own moment and is gone.
      float tq = life * (0.45 + 0.5 * h2);
      float pop = step(tq, tau) * exp(-max(tau - tq, 0.0) / 0.045);
      bright = mix(bright, (0.35 * fl + 6.0 * pop) * step(tau, tq + 0.2), kc.y);
      col = mix(col, mix(col, vec3(1.0, 0.95, 0.85), pop), kc.y);
      // A crossette's pieces: a white-gold flash each, twinkling out in 0.6 s.
      float since = max(tl - tp, 0.0);
      float tw = 0.5 + 0.5 * hash(floor(uTime * 30.0), fj + seed * 7.0);
      bright = mix(bright, (6.0 * exp(-since / 0.07) + 1.8 * tw) * (1.0 - smoothstep(0.35, 0.6, since)), popped);
      col = mix(col, POP, popped);
      // (along a trail: the head brightest)
      bright *= mix(kc.w, 1.0, pow(s, 1.6));
      width = kb.x * (1.0 + 2.5 * pop * kc.y);
      minPx = 1.9;
      col *= bright * uView.z;
      // (hidden: before it left, after its life (a crossette's pieces: soon after their pop), a crossette's pieces
      // before it, past its count)
      float end = mix(life, tp + 0.6, cr);
      hide = float(tl < 0.0 || tl > end || fj >= n || cr * step(0.5, piece) * step(tl, tp) > 0.5 || piece > 3.5);
    } else {
      // ── The halos: 0 the shell climbing on its trail, 1 the white flash of the burst, 2 its glow in the air
      // round it (the haze lit), 3 its smoke, lit by the bursts after it. A table by j, no branches.
      vec4 oh = vec4(equal(ivec4(j), ivec4(0, 1, 2, 3)));
      vec4 kf = KF[kind];
      float rise = d1.w;
      float tl = tau + rise;
      float tv = max(tl - (1.0 - s) * kf.y, 0.0);
      vec3 head = climb(d1.xyz, b, rise, tv);
      vec3 smokeAt = b + vec3(0.6, 0.35, 0.25) * tau - vec3(0.0, size * 0.15, 0.0);
      p = oh.x * head + oh.y * b + oh.z * b + oh.w * smokeAt;
      v = oh.x * (b - d1.xyz) + vec3(0.0, 1.0, 0.0) * (1.0 - oh.x);
      // (the halos are still: the ribbon is a square round its point, its length nothing)
      float fl = 0.75 + 0.25 * hash(floor(uTime * 30.0), seed * 7.0);
      vec3 shell = mix(vec3(1.0, 0.78, 0.45), mix(d2.rgb, vec3(1.0), 0.3), kf.z) * 1.6 * kf.w * fl * mix(0.1, 1.0, pow(s, 2.0)) * (0.6 + 0.4 * smoothstep(0.0, 0.3, tl));
      vec3 flash = mix(d2.rgb, vec3(1.0), 0.65) * 4.0 * exp(-max(tau, 0.0) / 0.06);
      float lp = burstLight(d4.w, KL[kind], tau);
      vec3 glow = d2.rgb * 0.13 * lp / max(d4.w, 1e-3);
      // smoke: its own faint grey under the moon, and the light of the bursts now near it
      vec3 lit = vec3(0.004, 0.005, 0.008) * uView.w;
      for (int i = 0; i < 2; i++) {
        float dl = length(uLightPos[i].xyz - smokeAt) / 70.0;
        lit += uLightCol[i].rgb * 0.035 / (1.0 + dl * dl);
      }
      vec3 smoke = lit * smoothstep(0.2, 1.4, tau) * (1.0 - smoothstep(5.0, 9.0, tau));
      col = oh.x * shell + oh.y * flash + oh.z * glow + oh.w * smoke;
      width = dot(oh, vec4(kf.x, size * 0.3 * (1.0 + 4.0 * max(tau, 0.0)), size * 2.0, size * (0.75 + 0.08 * tau)));
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
    // (the water mirrors the burst's sparks as long as they glow, not only its flash: a slower curve than its light)
    float wl = KL[int(d2.w + 0.5)];
    float lp = tau < 0.0 ? 0.0 : d4.w * (0.5 * exp(-tau / 0.09) + 0.45 * exp(-tau / 1.1) + wl * 0.4 * exp(-tau / 2.6));
    vec2 toCam = c.xz - at.xz;
    float dc = max(length(toCam), 1e-3);
    vec2 dir = toCam / dc;
    vec2 sideV = vec2(-dir.y, dir.x);
    float r = d3.w * length(at - c) / max(length(m - c), 1e-3);
    float sinA = (c.y - level) / max(length(at - c), 1e-3);
    // (seen low over it, stretched towards the eye by the ripples: a long soft streak, as the lamps' on the water)
    float len = clamp(r / max(sinA, 0.08) * 2.2, 3.0, 60.0);
    float wid = r * 0.7 + 0.4;
    vec2 xz = at.xz + dir * (position.y * len) + sideV * (position.x * 2.0 * wid);
    vec4 mvPosition = viewMatrix * vec4(xz.x, level + 0.12, xz.y, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vCol = mix(d2.rgb, vec3(1.0), 0.2) * lp * 1.1 * (0.4 + 0.6 * uNight);
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
    // (glints across the streak, as the festival's lamps on the water: festival/_glow.ts)
    float ripple = 0.55 + 0.45 * sin(along * 23.0 - uTime * 2.1 + vSeed * 40.0) * sin(along * 9.0 + uTime * 0.9);
    float shape = exp(-across * across * 2.5) * (1.0 - along * along);
    vec3 col = vCol * shape * ripple * inside;
    #ifdef USE_FOG
      col *= 1.0 - 0.8 * hazeDistance(length(vFogWorld - cameraPosition));
    #endif
    if (max(col.r, max(col.g, col.b)) < 0.002) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;
