# 빠른 정답 목록에서 번호 오른쪽을 잘라 정답 그림으로 만든다
import json, os
import numpy as np
from PIL import Image
from adet import apage

S = os.path.dirname(os.path.abspath(__file__))
P = lambda f: os.path.join(S, f)
rows = json.load(open(P('anums_ok.json'), encoding='utf8'))
allr = json.load(open(P('anums.json'), encoding='utf8'))
OUT = P('out/a'); os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))

byp = {}
for r in allr: byp.setdefault(r['pg'], []).append(r)
cache = {}; made = 0
for r in rows:
    if r['pg'] not in cache: cache.clear(); cache[r['pg']] = apage(r['pg'])
    im = cache[r['pg']]; H, W = im.shape[:2]
    lim = 840 if r["half"] == 0 else 1596
    same = [o for o in byp[r['pg']] if abs(o['y0'] - r['y0']) < 16 and o['x0'] > r['x1'] + 8 and o['x0'] <= lim + 60]
    x1 = min([o['x0'] - 10 for o in same] + [lim])
    x0 = r['x1'] + 6
    if x1 - x0 < 14: continue
    a = im[max(0, r['y0'] - 16):min(H, r['y1'] + 18), x0:x1]
    g = a.mean(2)
    cols = np.where((g < 185).any(0))[0]; rr = np.where((g < 185).any(1))[0]
    if not len(cols) or not len(rr): continue
    a = a[max(0, rr[0] - 4):rr[-1] + 5, max(0, cols[0] - 5):cols[-1] + 6]
    if a.shape[1] < 6 or a.shape[0] < 6: continue
    Image.fromarray(a.astype(np.uint8)).save(os.path.join(OUT, f"{r['no']:04d}.png")); made += 1
print('정답 조각', made, '/', len(rows))
