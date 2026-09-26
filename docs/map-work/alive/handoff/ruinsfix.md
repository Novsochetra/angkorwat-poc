# Handoff: ruinsfix (forest Buddha face, laterite paving, candle halos)

Task: three look fixes in the jungle shrines. (1) The forest Buddha's face reads as a skull. (2) The "laterite" paving and the camps' stepping stones come out navy blue. (3) At night the candle halo bleaches the Buddha's lower body to white.

## Done
- Nothing is changed in the code yet. The stop came while I was reading and taking the "before" shots, so there are no half edits. Every file below is as I found it.
- The causes are found (below), so the next person can start straight on the edits.

## What causes each problem, and how to fix it
Do NOT edit `src/map/jungle/ruins.ts`. Another fixer (perfworld) is splitting it into per-site meshes. Make only targeted edits in the helpers.

### 1. The skull face: `src/map/jungle/_ruinShrines.ts` `seatedBuddha`, the head block (about lines 123–182)
Causes:
- **Eyes too dark.** The eyes (line ~168) use `B.shade` 0x938875 on skin `B.skin` 0xc4b9a3. That is 0.75 in sRGB but about 0.53 in linear light, and the shadow under the bodhi tree makes it look black.
- **The "nose hole" is really the mouth.** The mouth cell `(0,2,4)` is `B.shade` and sits between two lips that stick out (`(0,1,5)` and `(0,3,5)`). The grid's AO darkens it further: the exposure is low and the overhang rule in `VoxelGrid.commit` (VoxelBuilder.ts, `has(i,j+1,k) && !has(i,j,k+1) && has(i,j+1,k+1)`) applies. The result is a black pit.
- **Skull-shaped outline.** The `ROWS` table narrows the chin fast (half-widths 2, 3, 4). The superellipse exponent 2.6 leaves a front plane only 7 cells wide (i −3..3), so the face is round-fronted, like a cranium.
- **Hair nearly black.** `B.hair` 0x7a7163, with a 0.84/1.06 checker, turns black-purple in the shade.
- **Ears hard to see.** The lobes are short and barely show from the front.

Planned new head. Keep the 0.125 m grid, the same origin and about the same size, so the neck and the body still fit:
- Shape: exponent 4 instead of 2.6, so the front plane is 9 cells wide (i −4..4) and the cheeks step back at ±5. Per-row `[hw, kb, kf]`: r0 `[3,-1,3]`, r1 `[4,-2,4]`, r2 `[4,-3,4]`, r3–r10 `[5,-4,4]`, r11–r12 `[5,-4,3]` (the step back at the hairline makes a clean, lit hairline), r13 `[4,-4,2]`, r14 `[3,-3,1]` (top of the skull). Then the ushnisha, covered in curls: r15–r16 hw 2, r17 hw 1. Then a gilded lotus-bud finial: a plus shape at r18, then r19 and r20 as single cells.
- Hair: `r >= 11 || k <= -2 || (|i| >= 5 && r >= 9 && k <= 1)` (the back of the head, and the temples down to the ear tops). Use a warm mid-dark stone, about 0x938772, with a gentle curl checker (shade 0.94 / 1.04), not black.
- Face stone: brighter and warm, with little variation, e.g. `[0xd6c8aa, 0xd2c4a6, 0xdacdaf]`. Make the feature colours with an sRGB multiply of the skin (write a small `scale(hex, f)` helper). Do not use `B.shade`.
- Features: all flush on the face plane (k = 4) except the nose:
  - nose: proud at k = 5 for (0, r4) and (0, r5); its bridge (0, r6–r7) about 1.04 lighter;
  - eyes, lowered: the lash line at r6, i = ±2..±4, about 0.84 in the middle (±3) and 0.9 at the ends; the heavy lid at r7 about 1.03; a faint brow at r8, i = ±1..±4, about 0.93;
  - mouth (the Angkor smile, faint): r2, i = −1..1, about 0.86; the corners (±2, r3) about 0.93, turned up; the lower lip at r1, i = −1..1, about 1.04. No lips sticking out, no pit;
  - no urna: Angkor-period Buddhas usually have none.
- Ears: i = ±6. The ear itself at r5–r9, k = −1..0 (slightly darker at (±6, r6–r7, 0) for the inner ear). The long lobes at r1–r4, k = 0. Make the jaw half-width 4 at r1–r2, so the lobes hang free with a gap beside the jaw.
- Optional: warm `B.stone` a little (about `[0xbcab8e, 0xb4a386, 0xc2b294, 0xae9d81]`) so the statue is not lavender-grey in the shade.

### 2. Navy "laterite"
- `_ruinShrines.ts` line ~345, `PATH_STONE = [0x8f877a, …]`. These are grey. The shade is lit by the blue sky, and the post grade adds lavender shadows (`src/map/post.ts` `DAY_GRADE.shadow` [0.96, 0.97, 1.08]), so they turn navy. `PATH_STONE` is used by the forest Buddha's paving (line ~204) and the stepping stones of the forest Buddha (line ~230) and the lake shrine (line ~436). Change it to warm laterite, e.g. `[0xa86f47, 0x9e6640, 0xb37a50, 0x94603d]`. `LATERITE` in `landmarks/_ruin.ts`, 0x7a5f4a…, is too dark and brown for paving. Do not edit that shared file.
- Camps: the stepping stones in `src/map/jungle/_campHut.ts` line ~235 and the flat stones under the stilts (line ~52) use `ROCK` from `_campKit.ts` (grey 0x8a8378…). So do the bridge-end stepping stones in `_bridges.ts` lines ~159–161. Add a new `FLAGSTONE` (laterite) list in `_campKit.ts` and use it in those places only. Leave `ROCK` for boulders and the pool, or warm it slightly if they also look navy in `c_hut`.

### 3. Candle halo bleaching the Buddha: `src/map/jungle/_incense.ts`
- Halos are additive camera-facing quads, all at a fixed strength of 0.34 (the `put(..., 1, ..., h.size, 0.34)` line). The forest Buddha pushes two halos (`_ruinShrines.ts` lines ~227–228): size 4.2 over the table, and **size 3.2 right in front of his body** at (0, 3.2, ZB + 0.8). That second one, with the bloom, turns the stone white.
- Fix: add an optional `strength` to `ShrineLights.halos` (default about 0.22) and use it in that `put`. In `forestBuddha`, remove the body halo (or keep it tiny and faint, about size 1.2 at 0.08) and shrink the table halo to about size 2.2. Check the others at night too: spirit house 2.4, lake shrine 3.2, Kulen 3. Probably lower the lake shrine and Kulen to about 2.2.

## How to check (shots; `SHOT_OUT=<scratch> SHOT_W=1672 SHOT_H=941 npm run shots -- name="@…"`)
- Front (the reviewer's): `@map.html?shot=1&ui=0&cam=-51.6,12.6,-304.5,-52,12.2,-310`
- Whole statue: `@map.html?shot=1&ui=0&cam=-51.3,13.5,-303,-52,11.5,-310` (add `&night=1` for the halo)
- Face, front: `@map.html?shot=1&ui=0&cam=-52,15.1,-307.6,-52,15.0,-311.6`. Close up: `cam=-52,15.05,-309.9,-52,15.0,-311.6`. Three-quarter: `cam=-49.6,15.4,-308.6,-52,15.0,-311.6`. Also with `&night=1`.
- From the prayer spot: `@map.html?shot=1&ui=0&roam=walk&at=-52,-306.9&yaw=180&act=pray&sim=_:3&rcam=0,8,4`
- Monk's hut stepping stones: `@map.html?shot=1&ui=0&cam=70.5,16,-327.9,75,12,-339`
- Other shrines at night: spirit house `cam=-124.5,10.5,83,-124.5,9.5,89`, lake `cam=-437.1,10.5,-72.6,-439.4,9,-65.7`, Kulen `cam=268,10.5,-232,268,9,-242` (each with `&night=1&ui=0`).
- The site: forest Buddha at (−52, −310), floor y 10, facing +z (snapped). The throne centre is at z −312. The head bottom is at y 14.25 and the face front at z ≈ −311.56.
- Checks: `npx tsc --noEmit`, `npm run build`.

## Files changed
None.

## Must know
- The reviewer's pictures are in the scratchpad, which does not move: `review-look/buddha_front.png`, `z_buddha_head.png`, `c_buddha_n.png`, `c_hut.png`. Retake them with the shots above as the "before" (the code is unchanged).
- The user is Khmer. The face must read as an Angkor-period Buddha: serene, lowered eyes, a slight smile, broad face, long lobes, curls, ushnisha. No Thai flame finial, no urna dot.
- `_ruinShrines.ts` is untracked (new in this work), so `git diff` shows nothing for it. Compare against the numbers here.
