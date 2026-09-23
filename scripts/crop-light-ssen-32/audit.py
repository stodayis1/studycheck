# 잘린 문항 그림을 되짚어 본다.
#  · 번호를 지웠는데도 4자리 번호가 남아 있으면 → 다른 문항이 섞여 들어간 것이므로 버린다
#  · 해독값과 배정값이 다른 것(suspect.json)도 버린다
import json, os
import numpy as np
from scipy import ndimage

S = os.path.dirname(os.path.abspath(__file__))
P = lambda f: os.path.join(S, f)
from PIL import Image

def leftover_number(path):
    im = np.asarray(Image.open(path).convert('L')).astype(int)
    m = im < 178
    lab, _ = ndimage.label(m)
    bx = []
    for sl in ndimage.find_objects(lab):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if 22 <= h <= 40 and 6 <= w <= 30:
            bx.append((sl[1].start, sl[1].stop, sl[0].start, sl[0].stop))
    bx.sort(key=lambda b: (b[2], b[0]))
    # 같은 줄에 붙어 있는 굵은 글자 4개 = 번호
    res = []; cur = []
    for b in bx:
        if cur and -4 <= b[0] - cur[-1][1] <= 14 and abs(b[2] - cur[-1][2]) < 10: cur.append(b)
        else:
            if cur: res.append(cur)
            cur = [b]
    if cur: res.append(cur)
    for g in res:
        w = g[-1][1] - g[0][0]
        if len(g) >= 4 and 50 <= w <= 110: return True
    return False

sus = set(json.load(open(P('suspect.json'), encoding='utf8')))
rows = json.load(open(P('qnums_typed.json'), encoding='utf8'))
drop = {}
for r in rows:
    n = r['no']
    p = P(f"out/q/{n:04d}.png")
    if not os.path.exists(p): continue
    if n in sus: drop[n] = '번호 의심'; continue
    try:
        if leftover_number(p): drop[n] = '번호 남음'
    except Exception:
        drop[n] = '읽기 실패'
import collections
print('버릴 문항', len(drop), collections.Counter(drop.values()))
json.dump(sorted(drop), open(P('drop.json'), 'w'))
