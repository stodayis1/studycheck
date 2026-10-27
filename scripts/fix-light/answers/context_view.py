# 번호 둘레를 좌표 눈금과 함께 보여 준다(손으로 자를 상자를 정하려고).
# 사용: context_view.py <쪽 그림 폴더> <출력.png> <번호> ...   (번호 위치는 tesseract)
import sys, os, subprocess, csv, io, re
from PIL import Image, ImageDraw, ImageFont
D, out, nums = sys.argv[1], sys.argv[2], sys.argv[3:]
T = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 16); big = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 26)
found = {}
for f in sorted(os.listdir(D)):
    if not re.fullmatch(r'[kp]\d+\.png', f): continue
    tsv = subprocess.run([T, os.path.join(D, f), 'stdout', '--psm', '11', 'tsv'], capture_output=True, text=True, encoding='utf-8').stdout
    for r in csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE):
        t = re.sub(r'\D', '', r.get('text') or '')
        if t in nums and t not in found: found[t] = (f, int(r['left']), int(r['top']))
tiles = []
for n in nums:
    if n not in found: continue
    f, x, y = found[n]; im = Image.open(os.path.join(D, f)).convert('RGB')
    x0, y0 = max(0, x - 40), max(0, y - 60); x1, y1 = min(im.width, x + 760), min(im.height, y + 330)
    c = im.crop((x0, y0, x1, y1)); d = ImageDraw.Draw(c)
    for gx in range((x0 // 50 + 1) * 50, x1, 50):
        d.line([(gx - x0, 0), (gx - x0, 8)], fill=(255, 0, 0)); d.text((gx - x0 + 1, 8), str(gx), fill=(255, 0, 0), font=font)
    for gy in range((y0 // 50 + 1) * 50, y1, 50):
        d.line([(0, gy - y0), (8, gy - y0)], fill=(0, 0, 255)); d.text((10, gy - y0 - 8), str(gy), fill=(0, 0, 255), font=font)
    tiles.append((f'{n} {f}', c))
H = sum(t.height + 34 for _, t in tiles); s = Image.new('RGB', (max(t.width for _, t in tiles), H), 'white'); dd = ImageDraw.Draw(s); yy = 0
for lab, t in tiles: dd.text((4, yy + 2), lab, fill=(0, 120, 0), font=big); s.paste(t, (0, yy + 32)); yy += t.height + 34
s.save(out); print('보임', [n for n in nums if n in found], '못 찾음', [n for n in nums if n not in found])
