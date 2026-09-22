# 확정된 번호로 '숫자별 평균 본보기'를 만들어 바로 해독한다 (군집을 거치지 않는다)
import json, os, bisect, collections
import numpy as np

S = os.path.dirname(os.path.abspath(__file__))
P = lambda f: os.path.join(S, f)
rows = json.load(open(P('qnums.json'), encoding='utf8'))
G = np.load(P('qglyphs.npy'))
N = len(rows)

# 줄 묶기 후 읽기 순서
ordr = sorted(range(N), key=lambda i: (rows[i]['pg'], rows[i]['half'], rows[i]['y0'], rows[i]['x0']))
rid = {}; base = None; cur = (-1, -1); r = -1
for i in ordr:
    k = (rows[i]['pg'], rows[i]['half'])
    if k != cur or base is None or rows[i]['y0'] - base > 25:
        r += 1; base = rows[i]['y0']; cur = k
    rid[i] = r
ordr = sorted(range(N), key=lambda i: (rid[i], rows[i]['x0']))
rows = [rows[i] for i in ordr]; G = G[ordr]


# 이 책의 번호는 0001~0645 — 첫 자리는 언제나 '0' 이다. 첫 자리를 자주 틀려서 아예 고정한다
def fix(s):
    return ('0' + s[1:]) if len(s) == 4 else s


def lis_assign(dec, sc, thr):
    idx = [i for i in range(len(dec)) if dec[i].isdigit() and 1 <= int(dec[i]) <= 650 and sc[i] >= thr]
    vals = [int(dec[i]) for i in idx]
    if not vals: return {}
    tails = []; ti = []; prev = [-1] * len(vals)
    for k, v in enumerate(vals):
        p = bisect.bisect_left(tails, v)
        if p > 0: prev[k] = ti[p - 1]
        if p == len(tails): tails.append(v); ti.append(k)
        else: tails[p] = v; ti[p] = k
    k = ti[-1]; ch = []
    while k >= 0: ch.append(k); k = prev[k]
    ch.reverse()
    keep = {idx[k]: vals[k] for k in ch}
    c = [idx[k] for k in ch]
    for a, b in zip(c, c[1:]):
        gi = list(range(a + 1, b)); gn = list(range(keep[a] + 1, keep[b]))
        if len(gi) == len(gn):
            for i, v in zip(gi, gn): keep[i] = v
    return keep


# 첫 해독: 손으로 붙인 군집 이름표 사용
from qlab import LAB
C = np.load(P('qcents.npy'))
ids = sorted(LAB); M = C[ids]; lab = [LAB[i] for i in ids]
dec = []; sc = []
for gl in G:
    s = ''; mn = 1.0
    for v in gl:
        v = np.asarray(v)
        if not v.any(): s += '?'; mn = 0; continue
        sim = M @ v; k = int(np.argmax(sim)); s += lab[k]; mn = min(mn, float(sim[k]))
    dec.append(fix(s)); sc.append(mn)
keep = lis_assign(dec, sc, 0.42)
print('1차 확정', len(keep), '| 최대', max(keep.values()) if keep else 0)

for it in range(6):
    T = collections.defaultdict(list)
    for i, n in keep.items():
        s = f"{n:04d}"
        for j, ch in enumerate(s): T[int(ch)].append(G[i][j])
    if len(T) < 10:
        print('  숫자 본보기가', len(T), '개뿐 — 중단'); break
    TK = sorted(T); TM = np.array([np.mean(T[k], 0) for k in TK])
    TM /= np.linalg.norm(TM, axis=1, keepdims=True)
    dec = []; sc = []
    for gl in G:
        s = ''; mn = 1.0
        for v in gl:
            v = np.asarray(v)
            if not v.any(): s += '?'; mn = 0; continue
            sim = TM @ v; k = int(np.argmax(sim)); s += str(TK[k]); mn = min(mn, float(sim[k]))
        dec.append(fix(s)); sc.append(mn)
    keep = lis_assign(dec, sc, 0.42)
    print('자기학습', it + 1, '확정', len(keep), '| 최대', max(keep.values()))

# 빠진 번호 메우기: 앞뒤 확정 사이에 남은 후보 중 해독이 한 글자만 다른 것을 채택
def ham(a, b): return sum(1 for x, y in zip(a, b) if x != y)
for _ in range(4):
    byval = {v: i for i, v in keep.items()}
    added = 0
    for n in [x for x in range(1, max(keep.values()) + 1) if x not in byval]:
        a = byval.get(n - 1); b = byval.get(n + 1)
        if a is None or b is None or not (a < b): continue
        free = [i for i in range(a + 1, b) if i not in keep]
        tgt = f"{n:04d}"
        close = [i for i in free if len(dec[i]) == 4 and ham(dec[i], tgt) <= 1]
        pick = close[0] if len(close) == 1 else (free[0] if len(free) == 1 else None)
        if pick is not None: keep[pick] = n; byval[n] = pick; added += 1
    print('  메움', added)
    if not added: break

mx = max(keep.values()); have = set(keep.values())
print('최종', len(keep), '| 최대', mx, '| 빠진', len([x for x in range(1, mx + 1) if x not in have]))
json.dump([dict(rows[i], no=keep[i]) for i in sorted(keep)], open(P('qnums_ok.json'), 'w'))
json.dump(dec, open(P('qdec.json'), 'w')); json.dump(sc, open(P('qsc.json'), 'w'))
