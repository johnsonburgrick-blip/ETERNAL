"""Developer tool: turn downloaded source images into optimised site assets.

Usage: python3 scripts/prepare-images.py <download-dir-with-meta.json>

Writes public/assets/img/<slug>.jpg (fallback) and <slug>-<w>.webp variants, and
seed/images.json (manifest with credit, licence and source used by the seed and shown
on the site). Requires Pillow.
"""
import json, os, sys
from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'public/assets/img')
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(ROOT, 'seed'), exist_ok=True)

ALT = {
    'hero-library': ('Philosophical Hall of the Strahov Monastery library, Prague', 'Salle philosophique de la bibliothèque du monastère de Strahov, Prague', 'architecture'),
    'admont-library': ('The baroque library hall of Admont Abbey, Austria', "La bibliothèque baroque de l'abbaye d'Admont, Autriche", 'architecture'),
    'orrery': ('Joseph Wright of Derby, A Philosopher Lecturing on the Orrery (c. 1766)', "Joseph Wright of Derby, Un philosophe faisant une conférence sur l'orrery (v. 1766)", 'history'),
    'pantheon': ('Giovanni Paolo Panini, Interior of the Pantheon, Rome (c. 1734)', "Giovanni Paolo Panini, Intérieur du Panthéon, Rome (v. 1734)", 'architecture'),
    'grande-galerie': ('Hubert Robert, The Grande Galerie of the Louvre', 'Hubert Robert, La Grande Galerie du Louvre', 'history'),
    'weishaupt': ('Engraved portrait of Adam Weishaupt', "Portrait gravé d'Adam Weishaupt", 'portraits'),
    'knigge': ('Engraved portrait of Adolph Freiherr Knigge', "Portrait gravé d'Adolph Freiherr Knigge", 'portraits'),
    'goethe': ('Johann Wolfgang von Goethe, portrait by Joseph Karl Stieler (1828)', 'Johann Wolfgang von Goethe, portrait par Joseph Karl Stieler (1828)', 'portraits'),
    'karl-theodor': ('Elector Karl Theodor, portrait by Pompeo Batoni', "L'électeur Charles-Théodore, portrait par Pompeo Batoni", 'portraits'),
    'ernst-ii': ('Duke Ernst II of Saxe-Gotha-Altenburg, portrait by Johann Georg Ziesenis', 'Le duc Ernest II de Saxe-Gotha-Altenbourg, portrait par Johann Georg Ziesenis', 'portraits'),
    'bode': ('Portrait of Johann Joachim Christoph Bode', 'Portrait de Johann Joachim Christoph Bode', 'portraits'),
    'kant': ('Portrait of Immanuel Kant', "Portrait d'Emmanuel Kant", 'portraits'),
    'ingolstadt': ('The Hohe Schule, former university building in Ingolstadt', "La Hohe Schule, ancien bâtiment de l'université d'Ingolstadt", 'architecture'),
    'minerval': ('Title page of Adam Weishaupt, Das verbesserte System der Illuminaten (1788), with the owl of Minerva emblem', "Page de titre d'Adam Weishaupt, Das verbesserte System der Illuminaten (1788), avec l'emblème de la chouette de Minerve", 'manuscripts'),
    'great-seal': ('Obverse and reverse of the Great Seal of the United States', 'Avers et revers du grand sceau des États-Unis', 'history'),
    'originalschriften': ('Title page of Einige Originalschriften des Illuminatenordens (1787)', 'Page de titre des Einige Originalschriften des Illuminatenordens (1787)', 'manuscripts'),
    'robison': ("Title page of John Robison's Proofs of a Conspiracy (1797)", 'Page de titre de Proofs of a Conspiracy de John Robison (1797)', 'manuscripts'),
}
WIDE = {'hero-library', 'admont-library', 'orrery', 'pantheon', 'grande-galerie', 'ingolstadt'}

meta = json.load(open(os.path.join(SRC, 'meta.json')))
manifest = {}
for slug, m in meta.items():
    path = m['file']
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        print('skip (missing)', slug)
        continue
    im = ImageOps.exif_transpose(Image.open(path))
    if im.mode in ('RGBA', 'LA', 'P'):
        bg = Image.new('RGB', im.size, (16, 16, 16) if slug != 'great-seal' else (242, 236, 223))
        im = im.convert('RGBA')
        bg.paste(im, mask=im.split()[-1])
        im = bg
    im = im.convert('RGB')
    widths = [w for w in ([480, 960, 1600, 1920] if slug in WIDE else [480, 800]) if w < im.width] + [min(im.width, 1920 if slug in WIDE else 1100)]
    widths = sorted(set(widths))
    variants = []
    for w in widths:
        h = round(im.height * w / im.width)
        v = im.resize((w, h), Image.LANCZOS)
        fn = f'{slug}-{w}.webp'
        v.save(os.path.join(OUT, fn), 'WEBP', quality=68 if w > 1000 else 72, method=6)
        variants.append({'w': w, 'url': f'/assets/img/{fn}', 'mime': 'image/webp', 'size': os.path.getsize(os.path.join(OUT, fn))})
    fb_w = min(im.width, 1280 if slug in WIDE else 900)
    fb = im.resize((fb_w, round(im.height * fb_w / im.width)), Image.LANCZOS)
    fb.save(os.path.join(OUT, f'{slug}.jpg'), 'JPEG', quality=72, optimize=True, progressive=True)
    en, fr, cat = ALT.get(slug, (slug, slug, 'history'))
    manifest[slug] = {
        'url': f'/assets/img/{slug}.jpg', 'width': fb_w, 'height': fb.height, 'size': os.path.getsize(os.path.join(OUT, f'{slug}.jpg')),
        'variants': variants, 'title': en, 'alt': {'en': en, 'fr': fr}, 'category': cat,
        'credit': m['artist'] or 'Unknown', 'license': m['license'], 'source': m['source'],
    }
    print(f'{slug}: {len(variants)} variants, fallback {fb_w}px')
json.dump(manifest, open(os.path.join(ROOT, 'seed/images.json'), 'w'), indent=1, ensure_ascii=False)
print('manifest:', len(manifest), 'images')
