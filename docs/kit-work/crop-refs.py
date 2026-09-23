"""Cut the section 18-20 reference sheets into per-component crops (2x) in
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
for name, (src, box) in crops.items():
    im = Image.open(src).convert('RGB').crop(box)
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    im.save(OUT + name + '.png')
# full sheets too
for name, src in [('sheet-18.1', S18_1), ('sheet-18.2', S18_2), ('sheet-19.1', S19_1), ('sheet-19.2', S19_2), ('sheet-20', S20)]:
    Image.open(src).convert('RGB').save(OUT + name + '.png')
print(len(crops), 'crops')
