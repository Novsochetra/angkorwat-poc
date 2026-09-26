"""Cut the section 15-21 reference sheets into per-component crops (2x) in
screenshots/refs/ (gitignored). Needs Pillow: pip install pillow.

  python3 docs/kit-work/crop-refs.py
"""
from PIL import Image
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
A = os.path.join(ROOT, 'assets', 'angkor detail') + '/'
OUT = os.path.join(ROOT, 'screenshots', 'refs') + '/'
os.makedirs(OUT, exist_ok=True)
S18_1 = A + 'section 18/section 18.1.png'
S18_2 = A + 'section 18/section 18.2.png'
S19_1 = A + 'section 19/85D8F367-EBB2-45B5-94C0-E9ED5A7CE350.PNG'
S19_2 = A + 'section 19/DC8CFA59-53FC-45C2-9C62-F650EC8907C8.PNG'
S20 = A + 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG'
crops = {
  # 18.1 trees
  '18.1-large-tree': (S18_1, (18, 128, 284, 592)),
  '18.1-medium-tree': (S18_1, (292, 128, 532, 592)),
  '18.1-small-tree': (S18_1, (540, 128, 760, 592)),
  '18.1-palm-tree': (S18_1, (768, 128, 1002, 592)),
  '18.1-bush': (S18_1, (1010, 128, 1230, 592)),
  '18.1-jungle-cluster': (S18_1, (1238, 128, 1518, 592)),
  '18.1-leaf-variations': (S18_1, (18, 598, 512, 742)),
  '18.1-trunk-variations': (S18_1, (520, 598, 964, 742)),
  '18.1-ground-foliage': (S18_1, (974, 598, 1518, 742)),
  '18.1-environment-examples': (S18_1, (18, 748, 788, 975)),
  '18.1-scale-reference': (S18_1, (798, 748, 1518, 975)),
  # 18.2 ground
  '18.2-combination-examples': (S18_2, (18, 676, 755, 948)),
  '18.2-in-game-usage': (S18_2, (764, 676, 1398, 962)),
  # 19.1 sandstone
  '19.1-usage-examples': (S19_1, (18, 700, 1048, 998)),
  '19.1-palette': (S19_1, (1058, 700, 1518, 872)),
  # 19.2 damage
  '19.2-combination-examples': (S19_2, (18, 655, 490, 958)),
  '19.2-in-game-usage': (S19_2, (500, 655, 1048, 958)),
  '19.2-palette': (S19_2, (1058, 655, 1518, 802)),
  # 20 props
  '20-stone-fragments': (S20, (16, 88, 302, 398)),
  '20-fallen-blocks': (S20, (310, 88, 622, 398)),
  '20-broken-statue': (S20, (630, 88, 908, 398)),
  '20-small-shrine': (S20, (916, 88, 1222, 398)),
  '20-offering-platform': (S20, (1230, 88, 1520, 398)),
  '20-stone-steps': (S20, (16, 408, 302, 692)),
  '20-drainage-channel': (S20, (310, 408, 622, 692)),
  '20-small-pond': (S20, (630, 408, 908, 692)),
  '20-fallen-leaves': (S20, (916, 408, 1222, 692)),
  '20-roots': (S20, (1230, 408, 1520, 692)),
  '20-grass-patches': (S20, (16, 702, 580, 962)),
  '20-environment-examples': (S20, (588, 702, 1380, 962)),
}
cols18_2 = ['grass','dirt','sandstone-path','moss','lichen','fallen-leaves','roots','small-rocks']
x0 = [18, 216, 403, 590, 771, 953, 1139, 1327]
for i, n in enumerate(cols18_2):
    crops['18.2-' + n] = (S18_2, (x0[i], 130, x0[i] + 192, 662))
cols19_1 = ['clean','warm','dark','cracked','weathered','mossy']
cols19_2 = ['broken-corner','missing-block','cracked-block','eroded-edge','collapsed-decorative','dark-weathering']
xs = [(18, 259), (271, 512), (524, 764), (774, 1014), (1025, 1266), (1277, 1518)]
for i, n in enumerate(cols19_1):
    crops['19.1-' + n] = (S19_1, (xs[i][0], 133, xs[i][1], 692))
for i, n in enumerate(cols19_2):
    crops['19.2-' + n] = (S19_2, (xs[i][0], 131, xs[i][1], 642))
S15 = A + 'section 15/ChatGPT Image Sep 22, 2026, 10_38_08 AM.png'
S16 = A + 'section 16/51F119C4-CD9A-4DB5-BCFD-840E8D3A151C.PNG'
S17A = A + 'section 17/9CD32C14-908E-487E-9287-BF45055F93A6.PNG'
S17B = A + 'section 17/B65034CE-0DD5-499B-B913-792827EFB323.PNG'
S21 = A + 'section 21/A0BE3E10-53DB-4C20-B81F-F9F8227B8AAA.PNG'
S21_1 = A + 'section 21/Codex Image Sep 22, 2026, 12_44_48 PM.png'
S21_2 = A + 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png'
S21_3 = A + 'section 21/Codex Image Sep 22, 2026, 12_48_32 PM.png'
# §15, 16, 17 and 21 (the architecture kit). Suffix -b: the second §17 sheet;
# -o: the §21 overview sheet (the others come from its three detailed sheets).
C = {}
for n, x in zip(['small-wall', 'long-wall', 'thick-wall', 'wall-corner', 'wall-end-cap'], [(18, 268), (280, 660), (673, 954), (967, 1266), (1279, 1518)]):
    C['15-' + n] = (S15, (x[0], 92, x[1], 352))
for n, x in zip(['door-opening', 'window-opening', 'decorative-wall'], [(18, 503), (520, 1025), (1042, 1518)]):
    C['15-' + n] = (S15, (x[0], 362, x[1], 570))
for n, x in zip(['gallery-wall', 'foundation-block', 'upper-wall-block', 'layer-breakdown', 'palette'], [(18, 400), (417, 662), (680, 961), (980, 1252), (1271, 1518)]):
    C['15-' + n] = (S15, (x[0], 579, x[1], 792))
C['15-example-assemblies'] = (S15, (18, 798, 1518, 1005))
for n, x in zip(['lower-terrace', 'middle-terrace', 'upper-terrace', 'terrace-wall', 'terrace-corner'], [(20, 312), (325, 615), (629, 913), (928, 1215), (1229, 1516)]):
    C['16-' + n] = (S16, (x[0], 92, x[1], 382))
for n, x in zip(['terrace-stair', 'terrace-parapet', 'terrace-platform', 'decorative-blocks'], [(20, 367), (382, 729), (744, 1095), (1110, 1516)]):
    C['16-' + n] = (S16, (x[0], 395, x[1], 665))
C['16-combination-example'] = (S16, (20, 680, 1259, 960))
xs6 = [(20, 257), (272, 509), (524, 760), (775, 1011), (1026, 1263), (1279, 1516)]
for n, x in zip(['water-surface', 'water-edge', 'stone-embankment', 'shore-vegetation', 'shallow-water', 'deep-water'], xs6):
    C['17.1-' + n] = (S17A, (x[0], 136, x[1], 456))
    C['17.1-' + n + '-b'] = (S17B, (x[0], 138, x[1], 482))
C['17.1-water-colours'] = (S17B, (20, 502, 708, 697))
C['17.1-shore-details'] = (S17B, (20, 711, 708, 945))
C['17.1-in-game-example'] = (S17B, (728, 502, 1516, 962))
for n, x in zip(['reflection', 'ripples', 'lily-pads', 'floating-vegetation', 'small-debris'], [(20, 313), (328, 616), (630, 907), (922, 1210), (1224, 1516)]):
    C['17.2-' + n] = (S17A, (x[0], 512, x[1], 716))
C['17-banner'] = (S17A, (20, 728, 1313, 968))
for n, x in zip(['block-1x1', 'block-1x2', 'block-1x3', 'block-2x2', 'block-2x4', 'long-wall-block', 'corner-block'], [(23, 203), (217, 408), (422, 632), (646, 827), (840, 1085), (1099, 1317), (1330, 1515)]):
    C['21.1-' + n] = (S21_1, (x[0], 95, x[1], 552))
C['21.1-additional-views'] = (S21_1, (23, 571, 724, 926))
C['21.1-in-game-usage'] = (S21_1, (739, 571, 1515, 926))
xs21 = [(21, 255), (269, 510), (523, 761), (775, 1015), (1031, 1269), (1284, 1516)]
for n, x in zip(['pillar', 'window', 'door', 'stair', 'roof-tile', 'roof-tier'], xs21):
    C['21.2-' + n] = (S21_2, (x[0], 91, x[1], 433))
for n, x in zip(['cornice', 'lintel', 'pediment', 'naga', 'lion', 'tower-tier'], xs21):
    C['21.2-' + n] = (S21_2, (x[0], 443, x[1], 741))
C['21.2-combinations'] = (S21_2, (23, 748, 675, 976))
C['21.2-grid'] = (S21_2, (688, 748, 936, 976))
C['21.2-in-game'] = (S21_2, (951, 748, 1516, 966))
for n, x in zip(['gallery-section', 'gallery-corner', 'gopura-section', 'terrace-section', 'tower-section', 'causeway-section', 'moat-section'], [(22, 246), (258, 453), (466, 668), (681, 883), (896, 1077), (1090, 1310), (1322, 1516)]):
    C['21.3-' + n] = (S21_3, (x[0], 92, x[1], 758))
C['21.3-placement'] = (S21_3, (22, 768, 1515, 976))
# the overview sheet's small versions
for n, x in zip(['block-1x1', 'block-1x2', 'block-1x3', 'block-2x2', 'block-2x4', 'long-wall-block', 'corner-block'], [(20, 206), (218, 416), (430, 646), (660, 866), (880, 1092), (1103, 1331), (1338, 1516)]):
    C['21.1-' + n + '-o'] = (S21, (x[0], 125, x[1], 276))
for n, x in zip(['pillar', 'window', 'door', 'stair', 'roof-tile', 'roof-tier', 'cornice', 'lintel', 'pediment', 'naga', 'lion', 'tower-tier'], [(20, 102), (104, 208), (210, 318), (320, 432), (434, 546), (548, 656), (658, 772), (774, 906), (908, 1072), (1074, 1266), (1268, 1372), (1374, 1516)]):
    C['21.2-' + n + '-o'] = (S21, (x[0], 326, x[1], 496))
for n, x in zip(['gallery-section', 'gallery-corner', 'gopura-section', 'terrace-section', 'tower-section', 'causeway-section', 'moat-section'], [(20, 236), (240, 436), (440, 626), (630, 852), (855, 1026), (1030, 1277), (1280, 1516)]):
    C['21.3-' + n + '-o'] = (S21, (x[0], 546, x[1], 736))
C['21-overview-combination'] = (S21, (20, 748, 1262, 970))
crops.update(C)
for name, (src, box) in crops.items():
    im = Image.open(src).convert('RGB').crop(box)
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    im.save(OUT + name + '.png')
# full sheets too
for name, src in [('sheet-18.1', S18_1), ('sheet-18.2', S18_2), ('sheet-19.1', S19_1), ('sheet-19.2', S19_2), ('sheet-20', S20),
                  ('sheet-15', S15), ('sheet-16', S16), ('sheet-17', S17A), ('sheet-17b', S17B),
                  ('sheet-21', S21), ('sheet-21.1', S21_1), ('sheet-21.2', S21_2), ('sheet-21.3', S21_3)]:
    Image.open(src).convert('RGB').save(OUT + name + '.png')
print(len(crops), 'crops')
