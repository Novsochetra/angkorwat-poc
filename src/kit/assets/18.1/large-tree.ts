import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';
import { buildBark, buildCanopy, buildStones, buildVines, emitStones, planTree, REF_H, treeColliders } from './_large-tree-parts';

/**
 * §18.1 ① Large tree — the Angkor jungle giant (strangler fig / banyan, like
 * the trees of Ta Prohm): a massive fluted trunk whose stepped buttress roots
 * spread over the ruin at its foot — arching over a wall stump, gripping and
 * splitting the sandstone blocks, moss on both — a broad dome of leaf clumps
 * and vines hanging from its limbs.
 */
export default defineKitAsset({
  section: '18.1',
  order: 1,
  name: 'Large tree',
  caption: 'Massive jungle tree with buttress roots and hanging vines.',
  size: {
    real: '≈ 22 m tall (18–26 m by seed), canopy ≈ 20 m, fluted trunk ≈ 4.5 m across, buttress roots spreading ≈ 12 m (surface roots to ≈ 16 m) over 0.5 m sandstone blocks',
    sheet: '12–15 m',
    note: 'Angkor’s giant trees — Tetrameles nudiflora at Ta Prohm, strangler figs, Dipterocarpus alatus — reach 25–45 m; 12–15 m would barely clear the temple galleries, so the tree is built at 22 m with the sheet’s proportions (hence the massive trunk and wide root plate). The blocks at its foot keep their real 0.5 m courses, so they look smaller than on the sheet.',
  },
  variants: [{ id: 'large', name: 'Large tree' }],
  shots: [
    { view: 'side', label: 'Side view' },
    { view: 'top', label: 'Top view' },
  ],
  mainView: 'iso-low',
  ref: { sheet: 'section 18/section 18.1.png', box: [18, 128, 284, 592] },
  build: ({ seed, height }) => {
    // Seed 1 is the 22 m reference tree; other seeds spread over 18–26 m.
    const H = height ?? REF_H + 4 * Math.sin((seed - 1) * 2.4);
    const plan = planTree(seed, H);
    const p = new PieceBuilder();
    const stones = buildStones(plan);
    const inCanopy = buildCanopy(p, plan);
    const bark = buildBark(p, plan, stones.set, stones.topAt, inCanopy);
    buildVines(p, plan, bark.solid, inCanopy);
    emitStones(p, stones.set, bark.drawn, seed);
    treeColliders(p, plan, bark.rootTops);
    return p.done();
  },
});
