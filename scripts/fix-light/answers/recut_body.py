# 풀이 본문(200dpi 쪽 그림)에서 「답」 아이콘을 본보기로 찾아, 문항 번호 아래의 마지막 「답」 오른쪽을 정답 그림으로 자른다.
#   번호: tesseract 로 찾은 네 자리 색 글자 · 아이콘: icon_dap.npy 와 정규상관(NCC)
#   문항 N 의 답 = N 번호 아래 ~ 같은 단 다음 번호 위 사이의 마지막 아이콘(쪽을 넘기면 다음 쪽 첫 번호 위)
# 사용: recut_body.py <쪽 폴더> <출력 폴더> <옛 그림 폴더> <번호:쪽> ...
import sys, os, subprocess, csv, io, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.signal import fftconvolve
D, OUT, OLD = sys.argv[1], sys.argv[2], sys.argv[3]; items = [a.split(':') for a in sys.argv[4:]]
os.makedirs(OUT, exist_ok=True)
T = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
ICON = np.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon_dap.npy'))[:, :22]
pages = {}
def load(p):
    f = os.path.join(D, f'p{p:03d}.png')
    if p in pages or not os.path.exists(f): return pages.get(p)
    rgb = np.asarray(Image.open(f).convert('RGB')).astype(int); g = rgb.mean(2)
    sat = (rgb.max(2) - rgb.min(2) > 18) & (rgb.min(2) < 170)
    tsv = subprocess.run([T, f, 'stdout', '--psm', '11', 'tsv'], capture_output=True, text=True, encoding='utf-8').stdout
    nums = []
    for r in csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE):
        t = re.sub(r'\D', '', r.get('text') or '')
        if re.fullmatch(r'\d{4}', t):
            x, y, w, h = int(r['left']), int(r['top']), int(r['width']), int(r['height'])
            if 30 < w < 120 and 15 < h < 50 and sat[y:y + h, x:x + w].mean() > 0.08: nums.append((t, x, y, x + w, y + h))
    # 아이콘 찾기 — 잉크(어두움)를 0 평균으로 맞춘 정규상관
    I = 255 - g; Tm = 255 - ICON; Tm = Tm - Tm.mean()
    num = fftconvolve(I, Tm[::-1, ::-1], mode='valid')
    ones = np.ones_like(Tm)
    s1 = fftconvolve(I, ones, mode='valid'); s2 = fftconvolve(I * I, ones, mode='valid')
    var = np.maximum(s2 - s1 * s1 / Tm.size, 1e-6)
    ncc = num / np.sqrt(var * (Tm * Tm).sum())
    icons = []
    ys, xs = np.where(ncc > 0.72)
    for y, x in sorted(zip(ys, xs), key=lambda v: -ncc[v[0], v[1]]):
        if all(abs(y - a) > 15 or abs(x - b) > 15 for a, b in icons): icons.append((y, x))
    pages[p] = dict(rgb=rgb, g=g, nums=nums, icons=sorted(icons), W=g.shape[1], H=g.shape[0])
    return pages[p]
def col(x, W): return 0 if x < W // 2 else 1
def answer_after(P, iy, ix, ylimit):
    """아이콘 오른쪽 정답.
    · 같은 줄(분수 높이 포함) + 바로 아래로 이어지는 줄(아이콘 왼쪽엔 글자가 없고, 한 줄 간격 안) — 여러 줄 정답
    · 오른쪽은 큰 빈칸(45px 넘게)이 나오면 끊는다 — 옆 그림 조각을 빼려고
    · ylimit: 다음 문항 번호 위"""
    g, W = P['g'], P['W']; h = ICON.shape[0]
    cl = 30 if col(ix, W) == 0 else W // 2 + 10
    x0 = ix + ICON.shape[1] + 4; x1 = (W // 2 - 20) if col(ix, W) == 0 else W - 60
    y0, y1 = iy - int(h * 1.3), min(ylimit - 4, iy + h * 8)
    ink = g[y0:y1, x0:x1] < 170
    left = g[y0:y1, cl:max(cl + 1, ix - 6)] < 170            # 아이콘 왼쪽(풀이 글자 자리)
    rows = np.where(ink.any(1))[0]
    bands, s = [], rows[0]
    for a_, b_ in zip(rows, rows[1:]):
        if b_ - a_ > 3: bands.append((s, a_)); s = b_
    bands.append((s, rows[-1]))
    c = h * 1.3 + h / 2
    keep = [b for b in bands if b[0] <= c + h * 0.7 and b[1] >= c - h * 1.2]
    for b in bands:
        if b[0] <= keep[-1][1]: continue
        if b[0] - keep[-1][1] > h * 1.4: break
        if left[b[0]:b[1] + 1].any(): break                   # 왼쪽에 글자가 있으면 풀이·채점기준 — 정답이 아니다
        keep.append(b)
    r0, r1 = keep[0][0], keep[-1][1]
    colsInk = ink[r0:r1 + 1].any(0)
    cols = np.where(colsInk)[0]
    # 큰 빈칸에서 끊기
    end = cols[0]
    for a_, b_ in zip(cols, cols[1:]):
        if b_ - a_ > 45: break
        end = b_
    else: end = cols[-1]
    return P['rgb'][y0 + r0 - 4: y0 + r1 + 5, x0 + max(0, cols[0] - 4): x0 + end + 6]
res = []
for n, pg in items:
    pg = int(pg); found = None
    for p in (pg, pg + 1):
        P = load(p)
        if P and any(t[0] == n for t in P['nums']): found = p; break
    if not found: res.append((n, None, '번호 못 찾음')); continue
    P = pages[found]; t = [t for t in P['nums'] if t[0] == n][0]; c0 = col(t[1], P['W'])
    # 같은 단에서 N 다음 번호(아래쪽) — 없으면 이 단 끝, 그 다음은 오른쪽 단/다음 쪽
    segs = []
    # 다음 번호 = 같은 단에서 읽는 순서로 다음(아래 줄, 또는 같은 줄 오른쪽)
    nxt = [u for u in P['nums'] if col(u[1], P['W']) == c0 and (u[2] > t[2] + 10 or (abs(u[2] - t[2]) <= 10 and u[1] > t[1] + 20))]
    same_line = [u for u in nxt if abs(u[2] - t[2]) <= 10]
    xcap = min([u[1] for u in same_line], default=None)      # 같은 줄 오른쪽 번호 앞까지만
    segs.append((found, c0, t[2], min([u[2] for u in nxt if u not in same_line] + [P['H']])))
    if not nxt:
        if c0 == 0:
            nx2 = [u for u in P['nums'] if col(u[1], P['W']) == 1]
            segs.append((found, 1, 0, min([u[2] for u in nx2] + [P['H']])))
        else:
            Q = load(found + 1)
            if Q:
                nx2 = [u for u in Q['nums'] if col(u[1], Q['W']) == 0]
                segs.append((found + 1, 0, 0, min([u[2] for u in nx2] + [Q['H']])))
    cand = []
    for k, (p, cc, ya, yb) in enumerate(segs):
        Q = pages[p]
        cand += [(p, y, x, yb) for y, x in Q['icons'] if col(x, Q['W']) == cc and ya - 5 <= y < yb - 5
                 and not (k == 0 and xcap is not None and abs(y - t[2]) <= 15 and x > xcap)]
    if not cand: res.append((n, None, '답 아이콘 못 찾음')); continue
    # 소문항마다 「답」이 따로 있으면(⑴⑵…) 모두 모아 위아래로 붙인다
    parts = []
    for p, iy, ix, yb in cand:
        arr = answer_after(pages[p], iy, ix, yb)
        if xcap is not None and p == found and abs(iy - t[2]) <= 15:   # 같은 줄 오른쪽 번호 앞에서 자른다
            arr = arr[:, :max(10, xcap - (ix + ICON.shape[1] + 4) - 6)]
        rr = np.where((arr.mean(2) < 170).any(1))[0]               # 좌우를 자른 뒤 남은 빈 줄 깎기
        if len(rr): arr = arr[max(0, rr[0] - 4): rr[-1] + 5]
        parts.append(arr)
    Wm = max(a_.shape[1] for a_ in parts)
    arr = np.concatenate([np.pad(a_, ((0, 4), (0, Wm - a_.shape[1]), (0, 0)), constant_values=255) for a_ in parts])[:-4]
    im = Image.fromarray(arr.astype(np.uint8))
    im.save(os.path.join(OUT, n + '.png')); res.append((n, im, f'p{p}'))
font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 22)
rowsH = [max(60, (Image.open(os.path.join(OLD, n + '.png')).height if os.path.exists(os.path.join(OLD, n + '.png')) else 0), (im.height if im else 0)) + 14 for n, im, _ in res]
s = Image.new('RGB', (1300, sum(rowsH)), 'white'); d = ImageDraw.Draw(s); y = 0
for (n, im, why), rh in zip(res, rowsH):
    d.text((4, y + 8), n, fill=(220, 0, 0), font=font)
    o = os.path.join(OLD, n + '.png')
    if os.path.exists(o): oi = Image.open(o).convert('RGB'); s.paste(oi.crop((0, 0, min(oi.width, 480), oi.height)), (80, y + 4))
    if im: s.paste(im.crop((0, 0, min(im.width, 720), im.height)), (570, y + 4))
    else: d.text((570, y + 8), why, fill=(0, 0, 255), font=font)
    d.line([(560, y), (560, y + rh)], fill=(0, 160, 0), width=2); y += rh
    d.line([(0, y - 2), (1300, y - 2)], fill=(200, 200, 255))
s.save(os.path.join(OUT, '_sheet.png'))
print('잘림', sum(1 for r in res if r[1] is not None), '/', len(res), '· 못함', [(r[0], r[2]) for r in res if r[1] is None])
