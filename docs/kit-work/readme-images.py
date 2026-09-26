"""Render the world-kit pictures in the README (docs/kit-*.webp).

Needs the dev server (node docs/kit-work/devserver.mjs) and Pillow.

  python3 docs/kit-work/readme-images.py
"""
import os
import subprocess
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SHOTS = os.path.join(ROOT, 'screenshots', 'readme')
DOCS = os.path.join(ROOT, 'docs')
BASE = os.environ.get('SHOT_BASE', 'http://localhost:5173')

# Section strips: the band and the first row of cards (main view + variants).
SECTIONS = ['18.1', '18.2', '19.1', '19.2', '20']
# Scenes for the grid, in reading order.
SCENES = ['tree-temple-wall', 'palm-causeway', 'dense-jungle', 'temple-path', 'weathered-gallery', 'shrine-offerings']


def shoot(pages, w=1600, h=1000, full=False):
    env = dict(os.environ, SHOT_BASE=BASE, SHOT_W=str(w), SHOT_H=str(h), SHOT_OUT=SHOTS, SHOT_FULL='1' if full else '0')
    args = [f'{name}=@{query}' for name, query in pages]
    subprocess.run(['node', 'scripts/screenshots.mjs', *args], cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL)


def save(im, name, width):
    im = im.convert('RGB')
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(DOCS, name), 'WEBP', quality=78, method=6)
    print(name, im.size, os.path.getsize(os.path.join(DOCS, name)) // 1024, 'KB')


def main():
    os.makedirs(SHOTS, exist_ok=True)
    shoot([(f's{s}', f'studio.html?section={s}&shot=1') for s in SECTIONS])
    for s in SECTIONS:
        im = Image.open(os.path.join(SHOTS, f's{s}.png'))
        # Band + first row of cards down to the variant labels.
        save(im.crop((0, 88, im.width, 560)), f'kit-{s.replace(".", "-")}.webp', 1400)
    shoot([(f'c-{s}', f'studio.html?scene={s}&shot=1') for s in SCENES])
    tiles = [Image.open(os.path.join(SHOTS, f'c-{s}.png')).crop((19, 142, 1581, 919)) for s in SCENES]
    tw, th = 700, round(700 * tiles[0].height / tiles[0].width)
    grid = Image.new('RGB', (tw * 2 + 8, th * 3 + 16), (241, 234, 219))
    for i, t in enumerate(tiles):
        grid.paste(t.resize((tw, th), Image.LANCZOS), ((i % 2) * (tw + 8), (i // 2) * (th + 8)))
    save(grid, 'kit-scenes.webp', 1408)
    # The explorer at the foot of the palm causeway's stairs (scene spawns follow the garden rows).
    shoot([('level', 'game.html?level=kit&shot=1&spawn=10&cam=30,14,10')], 1400, 800)
    save(Image.open(os.path.join(SHOTS, 'level.png')), 'kit-level.webp', 1200)


if __name__ == '__main__':
    main()
