/**
 * Explorer colours. Base values are sampled from the "3.2 Colour Palette" swatches
 * of the character sheet; the in-between tones are sampled from the rendered
 * turnaround / close-up panels so the lit result matches the reference.
 */
export const PALETTE = {
  skin: {
    light: 0xfbcb9c,
    base: 0xfab57c,
    warm: 0xf5ab72,
    shade: 0xc98252,
    neck: 0xc9895e,
  },
  blush: 0xfc9c64,
  mouth: 0xbd3a36,
  mouthDark: 0x7a2024,
  eyeWhite: 0xf5f0ea,
  /** upper white, shaded by the brow and fringe */
  eyeWhiteShade: 0xe3d6cc,
  eyeDark: 0x1e1613,
  /** lower half of the pupil is a warm dark brown on the sheet */
  eyeDarkLow: 0x3e2a25,
  brow: 0x2d201b,
  hair: {
    darkest: 0x271f1d,
    dark: 0x312723,
    base: 0x3a2e29,
    mid: 0x483831,
    light: 0x57453b,
  },
  shirt: {
    light: 0xe1d3be,
    base: 0xd8c4ab,
    mid: 0xcbb498,
    shade: 0xbd9f7d,
    cuff: 0xe3d5c0,
  },
  shorts: {
    base: 0x505356,
    light: 0x5c5f62,
    dark: 0x45484b,
    hem: 0x575a5d,
  },
  sock: 0xe9dccb,
  krama: {
    red: 0xbc3242,
    red2: 0xae2d3b,
    redLight: 0xcf4048,
    dark: 0x822333,
    darkest: 0x5c1d27,
    light: 0xe46d50,
    lightDark: 0xa2393d,
    fringe: 0xa22c38,
    fringeDark: 0x6e1d28,
  },
  leather: {
    light: 0x8c5836,
    base: 0x7c4c2f,
    mid: 0x70452b,
    dark: 0x5c3824,
    darkest: 0x4c2f20,
    strap: 0x683f27,
  },
  boot: {
    base: 0x422818,
    upper: 0x4a2d1b,
    toe: 0x563521,
    cuff: 0x3b2417,
    sole: 0x2a1c14,
  },
  camera: {
    light: 0x9c9a97,
    plate: 0x8b8986,
    mid: 0x5b5e61,
    body: 0x414447,
    dark: 0x34373a,
    glass: 0x0e0f11,
  },
  red: 0xc8323c,
  brass: 0xc8922e,
  brassDark: 0x9a6a22,
  rivet: 0x5b5752,
  wood: { base: 0x6b4226, dark: 0x4f2f1a, light: 0x855634 },
  torch: { yellow: 0xfdce63, orange: 0xeb9024, deep: 0x9c4f15, core: 0xfff1b8 },
  hat: { base: 0xd9c6a2, light: 0xe8d8ba, shade: 0xc4ad86, band: 0x4a3020 },
  sampot: { base: 0x5b4a3a, light: 0x6e5a46, dark: 0x463829, gold: 0xa8823e },
  bedroll: { base: 0x8a7a55, light: 0x9f8e66, strap: 0x5d3626 },
  canteen: { base: 0x5f6b52, cap: 0x3d3f3e },
} as const;
