#!/usr/bin/env python3
"""Colour sampler for kit calibration.

  python3 measure.py IMAGE x0 y0 x1 y1 [k]
      median colour + k dominant tones (k-means, default 5) of a pixel box,
      ignoring the cream sheet / studio background.
  python3 measure.py --crop IMAGE x0 y0 x1 y1 OUT.png [scale]
      save an enlarged crop (to look closely at a detail).
"""
import sys
import numpy as np
from PIL import Image

def hexs(c):
    return '#%02x%02x%02x' % tuple(int(v) for v in c)

args = sys.argv[1:]
if args and args[0] == '--crop':
    _, path, x0, y0, x1, y1, out, *rest = args
    s = float(rest[0]) if rest else 3
    im = Image.open(path).convert('RGB').crop((int(x0), int(y0), int(x1), int(y1)))
    im.resize((int(im.width * s), int(im.height * s)), Image.NEAREST).save(out)
    print('saved', out)
    sys.exit(0)
path, x0, y0, x1, y1, *rest = args
k = int(rest[0]) if rest else 5
a = np.asarray(Image.open(path).convert('RGB').crop((int(x0), int(y0), int(x1), int(y1)))).reshape(-1, 3).astype(float)
bgs = [np.array([244, 237, 220]), np.array([251, 247, 239]), np.array([241, 234, 219])]
keep = np.ones(len(a), bool)
for bg in bgs:
    keep &= np.linalg.norm(a - bg, axis=1) > 18
a = a[keep]
if len(a) == 0:
    print('only background in that box'); sys.exit(0)
print('median', hexs(np.median(a, 0)), f'({len(a)} px)')
rng = np.random.default_rng(0)
c = a[rng.choice(len(a), min(k, len(a)), replace=False)]
for _ in range(25):
    lab = np.argmin(((a[:, None, :] - c[None]) ** 2).sum(-1), axis=1)
    for i in range(len(c)):
        if (lab == i).any():
            c[i] = a[lab == i].mean(0)
cnt = np.bincount(lab, minlength=len(c))
print('tones ', ' '.join(f'{hexs(c[i])}:{cnt[i] * 100 // len(a)}%' for i in np.argsort(-cnt)))
