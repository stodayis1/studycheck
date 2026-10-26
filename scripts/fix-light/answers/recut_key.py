# 빠른정답 표(200dpi 쪽 그림)에서 문항 번호를 tesseract 로 찾아 정답 그림을 다시 자른다.
#   오른쪽 끝: 같은 줄의 다음 번호 앞(없으면 단 끝) · 아래 끝: 아랫줄 번호 위
#   위·아래로는 잉크 띠를 따라 붙인다(분수·표가 번호 줄보다 크다)
# 사용: recut_key.py <쪽 그림 폴더> <출력 폴더> <번호> ...   → <출력>/<번호>.png + 비교용 <출력>/_sheet.png (옛 그림 폴더는 --old)
import sys, os, subprocess, csv, io, re, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ap = argparse.ArgumentParser(); ap.add_argument('pages'); ap.add_argument('out'); ap.add_argument('nums', nargs='+'); ap.add_argument('--old')
ap.add_argument('--manual', help='json {번호: [쪽파일, x0, y0, x1, y1]} — 자동이 틀린 것만. 상자 안에서 잉크만 남긴다')
a = ap.parse_args()
import json
MANUAL = json.load(open(a.manual, encoding='utf-8')) if a.manual else {}
T = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
os.makedirs(a.out, exist_ok=True)
toks = []   # (page, n, x0, y0, x1, y1)
for f in sorted(os.listdir(a.pages)):
    if not re.fullmatch(r'k\d+\.png', f): continue
    tsv = subprocess.run([T, os.path.join(a.pages, f), 'stdout', '--psm', '11', 'tsv'], capture_output=True, text=True, encoding='utf-8').stdout
    for r in csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE):
        t = re.sub(r'\D', '', (r.get('text') or ''))
        if re.fullmatch(r'\d{4}', t) and float(r.get('conf') or 0) > 20:
            x, y, w, h = int(r['left']), int(r['top']), int(r['width']), int(r['height'])
            if 25 < w < 140 and 12 < h < 70: toks.append((f, t, x, y, x + w, y + h))
def colored(t):
    """문항 번호는 색 글자다 — 정답 속 네 자리 수(1700 등)를 번호로 착각하지 않게."""
    f, _, x0, y0, x1, y1 = t; page(f)
    return sat[f][y0:y1, x0:x1].mean() > 0.08
img, sat = {}, {}
def page(f):
    if f not in img:
        rgb = np.asarray(Image.open(os.path.join(a.pages, f)).convert('RGB')).astype(int)
        img[f] = rgb.mean(2); rgbs[f] = rgb
        # 색 글자(번호·단계 띠). 스캔이라 번호의 주황·초록이 흐리다 — 채도 30~40, 정답 검은 글자는 0
        sat[f] = (rgb.max(2) - rgb.min(2) > 18) & (rgb.min(2) < 170)
    return img[f]
rgbs = {}
toks = [t for t in toks if colored(t)]
# 손으로 정한 것: 번호를 끝내 못 읽은 것은 옆 번호 자리로 대신한다
ALIAS = {}
res = []
for n in a.nums:
    if n in MANUAL:
        f, mx0, my0, mx1, my1 = MANUAL[n]; page(f)
        sub = img[f][my0:my1, mx0:mx1] < 170
        rr, cc2 = np.where(sub.any(1))[0], np.where(sub.any(0))[0]
        crop = Image.fromarray(rgbs[f][my0 + rr[0] - 4: my0 + rr[-1] + 5, mx0 + cc2[0] - 5: mx0 + cc2[-1] + 6].astype(np.uint8))
        crop.save(os.path.join(a.out, n + '.png')); res.append((n, crop, f + ' 손')); continue
    hit = [t for t in toks if t[1] == n]
    if not hit: res.append((n, None, '번호 못 찾음')); continue
    f, _, x0, y0, x1, y1 = hit[0]; g = page(f); H, W = g.shape; h = y1 - y0; cy = (y0 + y1) / 2
    colR = W // 2 - 12 if x0 < W // 2 else W - 40           # 두 단
    same = [t for t in toks if t[0] == f and abs((t[3] + t[5]) / 2 - cy) < h * 0.6 and t[2] > x1]
    right = min([t[2] - 8 for t in same] + [colR])
    h = min(h, 26); cy = y0 + h / 2                             # 번호 상자가 아래 표와 붙어 커진 경우(0532) 한 줄 높이로
    sameCol = lambda t: (t[2] < W // 2) == (x0 < W // 2)
    below = [t for t in toks if t[0] == f and t[3] > y0 + h * 0.8 and t[2] < right and t[4] > x0 - 40 and sameCol(t)]
    bottom = min([t[3] - int(h * 0.8) for t in below] + [H - 60])   # 아랫줄 분수가 번호보다 위로 솟는다
    above = [t for t in toks if t[0] == f and t[5] < y0 + 2 and sameCol(t) and t[4] > x0 - 40 and t[2] < right]
    top = max([0, y0 - int(h * 1.6)] + [t[5] + 4 for t in above if t[5] > y0 - h * 2.5])
    L = x1 + 6
    # 번호 줄 높이에서 오른쪽으로 색 글자(다음 번호)가 10픽셀 넘게 이어지는 곳 앞에서 끊는다
    band = sat[f][int(y0):int(y0 + h), L:right].sum(0) > 1
    run = 0
    for i, v in enumerate(band):
        run = run + 1 if v else 0
        if run >= 10: right = L + max(10, i - run - 6); break
    sub = g[top:bottom, L:right]
    ink = (sub < 170)
    rows = np.where(ink.any(1))[0]
    if not len(rows): res.append((n, None, '잉크 없음')); continue
    # 잉크 띠 나누기(빈 줄 5개 이상이면 끊는다)
    bands, s = [], rows[0]
    for p, q in zip(rows, rows[1:]):
        if q - p > 5: bands.append((s, p)); s = q
    bands.append((s, rows[-1]))
    c = cy - top
    keep = [b for b in bands if b[1] >= c - h * 0.9]          # 번호 줄보다 많이 위에 있는 띠(윗줄)는 버린다
    line = [b for b in keep if b[0] <= c + h * 0.6]
    rest = [b for b in keep if b[0] > c + h * 0.6]
    # 아래 띠는 바로 이어진 것만(표·그래프) — 한 줄 넘게 떨어진 것은 다른 답이다
    for b in rest:
        if line and b[0] - line[-1][1] <= h * 0.9: line.append(b)
        else: break
    keep = line or keep
    r0, r1 = keep[0][0], keep[-1][1]
    cols = np.where(ink[r0:r1 + 1].any(0))[0]
    crop = Image.fromarray(rgbs[f][top + r0 - 4: top + r1 + 5, L + max(0, cols[0] - 5): L + cols[-1] + 6].astype(np.uint8))
    crop.save(os.path.join(a.out, n + '.png')); res.append((n, crop, f))
# 비교 그림: 번호 · 옛 그림 · 새 그림
font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 22)
tiles = []
for n, crop, why in res:
    old = Image.open(os.path.join(a.old, n + '.png')).convert('L') if a.old and os.path.exists(os.path.join(a.old, n + '.png')) else None
    tiles.append((n, old, crop, why))
Wd = 1300; rowsH = [max(60, (o.height if o else 0), (c.height if c else 0)) + 14 for _, o, c, _ in tiles]
s = Image.new('RGB', (Wd, sum(rowsH)), 'white'); d = ImageDraw.Draw(s); y = 0
for (n, o, c, why), rh in zip(tiles, rowsH):
    d.text((4, y + 8), n, fill=(220, 0, 0), font=font)
    if o: s.paste(o.crop((0, 0, min(o.width, 480), o.height)), (80, y + 4))
    if c: s.paste(c.crop((0, 0, min(c.width, 720), c.height)), (570, y + 4))
    else: d.text((570, y + 8), why, fill=(0, 0, 255), font=font)
    d.line([(560, y), (560, y + rh)], fill=(0, 160, 0), width=2); y += rh
    d.line([(0, y - 2), (Wd, y - 2)], fill=(200, 200, 255))
s.save(os.path.join(a.out, '_sheet.png'))
print('잘림', sum(1 for r in res if r[1] is not None), '/', len(res), '· 못함', [(r[0], r[2]) for r in res if r[1] is None])
