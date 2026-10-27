# 풀이 본문: 번호가 있는 단(column)을 번호 위 40px ~ 아래 DOWN px 까지 눈금과 함께 보여 준다. 여러 문항을 가로로 나란히.
# 사용: ctx2.py <쪽 폴더> <출력.png> <DOWN> <번호:쪽> ...
import sys, os, subprocess, csv, io, re
from PIL import Image, ImageDraw, ImageFont
D, out, DOWN = sys.argv[1], sys.argv[2], int(sys.argv[3]); items = [a.split(':') for a in sys.argv[4:]]
T = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
fnt = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 15); big = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 24)
cache, tiles = {}, []
for n, pg in items:
    pos = None
    for p in (int(pg), int(pg) + 1):
        f = os.path.join(D, f'p{p:03d}.png')
        if not os.path.exists(f): continue
        if f not in cache:
            tsv = subprocess.run([T, f, 'stdout', '--psm', '11', 'tsv'], capture_output=True, text=True, encoding='utf-8').stdout
            cache[f] = list(csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE))
        hit = [r for r in cache[f] if re.sub(r'\D', '', r.get('text') or '') == n]
        if hit: pos = (f, int(hit[0]['left']), int(hit[0]['top'])); break
    if not pos: tiles.append((f'{n} 못 찾음', Image.new('RGB', (300, 60), 'white'))); continue
    f, x, y = pos; im = Image.open(f).convert('RGB'); W = im.width
    x0 = 0 if x < W // 2 else W // 2 - 30; x1 = x0 + W // 2 + 30
    y0, y1 = max(0, y - 40), min(im.height, y + DOWN)
    c = im.crop((x0, y0, x1, y1)); d = ImageDraw.Draw(c)
    for gx in range((x0 // 100 + 1) * 100, x1, 100):
        d.line([(gx - x0, 0), (gx - x0, c.height)], fill=(255, 190, 190)); d.text((gx - x0 + 2, 2), str(gx), fill=(255, 0, 0), font=fnt)
    for gy in range((y0 // 50 + 1) * 50, y1, 50):
        d.line([(0, gy - y0), (c.width, gy - y0)], fill=(200, 200, 255)); d.text((2, gy - y0 - 16), str(gy), fill=(0, 0, 255), font=fnt)
    tiles.append((f'{n} {os.path.basename(f)}', c))
Wt = sum(t.width + 20 for _, t in tiles); Ht = max(t.height for _, t in tiles) + 36
s = Image.new('RGB', (Wt, Ht), 'white'); dd = ImageDraw.Draw(s); xx = 0
for lab, t in tiles: dd.text((xx + 4, 4), lab, fill=(0, 130, 0), font=big); s.paste(t, (xx, 34)); xx += t.width + 20
s.save(out)
