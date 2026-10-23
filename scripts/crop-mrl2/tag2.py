# -*- coding: utf-8 -*-
"""「유형 08」 꼬리표의 숫자를 읽는다.

꼬리표에는 숫자 위아래로 **장식 선**(⟨ ⟩ 모양)이 있다. 그걸 같이 자르면
글자 모양이 망가져 아무거나 읽힌다. 그래서 잉크가 많은 가운데 줄만 남긴다.
"""
import numpy as np
from PIL import Image


def core_rows(ink, frac=0.3):
    """장식 선을 뺀 **글자 줄**만"""
    p = ink.sum(1)
    if not p.max():
        return None
    th = p.max() * frac
    ys = np.nonzero(p >= th)[0]
    if not len(ys):
        return None
    # 가장 긴 이어진 구간
    best = (ys[0], ys[0])
    s = ys[0]
    for a, b in zip(ys[:-1], ys[1:]):
        if b - a > 2:
            if a - s > best[1] - best[0]:
                best = (s, a)
            s = b
    if ys[-1] - s > best[1] - best[0]:
        best = (s, ys[-1])
    return best


def cells(a, x0, x1, y0, y1):
    ink = (a[y0:y1, x0:x1].min(2) < 205)
    cr = core_rows(ink)
    if cr is None:
        return None
    ink = ink[cr[0]:cr[1] + 1]
    cs = np.nonzero(ink.any(0))[0]
    if len(cs) < 10:
        return None
    ink = ink[:, cs[0]:cs[-1] + 1]
    w = ink.shape[1]
    prof = ink.sum(0)
    lo, hi = max(3, w // 2 - 5), min(w - 3, w // 2 + 6)
    m = min(range(lo, hi), key=lambda t: prof[t]) if hi > lo else w // 2
    return [ink[:, :m], ink[:, m:]]


def vec(g):
    rs = np.nonzero(g.any(1))[0]
    cs = np.nonzero(g.any(0))[0]
    if not len(rs) or not len(cs) or g.sum() < 5:
        return None
    p = g[rs[0]:rs[-1] + 1, cs[0]:cs[-1] + 1].astype(np.float32)
    im = Image.fromarray((p * 255).astype(np.uint8)).resize((16, 24), Image.BILINEAR)
    v = np.asarray(im, np.float32).ravel() / 255.0
    n = np.linalg.norm(v)
    return v / n if n else None


def read(a, x0, x1, y0, y1, ex, ey, k=7):
    cc = cells(a, x0, x1, y0, y1)
    if not cc:
        return None
    vs = [vec(g) for g in cc]
    if any(v is None for v in vs):
        return None
    sim = np.array(vs) @ ex.T
    top = np.argpartition(-sim, k, axis=1)[:, :k]
    ds = []
    for i in range(2):
        sc = np.zeros(10)
        for d, w in zip(ey[top[i]], sim[i, top[i]]):
            sc[d] += w
        ds.append(int(sc.argmax()))
    return ds[0] * 10 + ds[1]


def find(a, r, lo=10, hi=240):
    """번호 오른쪽에서 꼬리표 **숫자 두 자리**의 자리를 찾는다.

    꼬리표는 「유형(검정) NN(색) ⟩(색 괄호)」 꼴이다.
    색 화소만 보고, 가로로 **가장 넓게 뭉친 덩어리**를 숫자로 본다
    (괄호는 폭 4px 쯤이라 저절로 밀린다).
    """
    from mdet2 import colmask
    nx = r['gx'][-1][1] if r.get('gx') else r['x0'] + 90
    y0 = max(0, r['y0'] - 12)
    y1 = min(a.shape[0], r['y1'] + 12)
    x0 = nx + lo
    x1 = min(a.shape[1], nx + hi)
    if x1 - x0 < 20:
        return None
    sub = a[y0:y1, x0:x1]
    m = np.zeros(sub.shape[:2], bool)
    for v in colmask(sub).values():
        m |= v
    cr = core_rows(m, 0.35)
    if cr is None:
        return None
    mm = m[cr[0]:cr[1] + 1]
    if mm.shape[0] < 10:
        return None
    cov = mm.mean(0)
    xs = np.nonzero(cov >= 0.25)[0]
    if len(xs) < 10:
        return None
    grp = [[xs[0], xs[0]]]
    for v in xs[1:]:
        if v - grp[-1][1] <= 9:
            grp[-1][1] = v
        else:
            grp.append([v, v])
    g = max(grp, key=lambda q: q[1] - q[0])
    w = g[1] - g[0]
    if not (12 <= w <= 60):
        return None
    return (int(x0 + g[0] - 3), int(x0 + g[1] + 4),
            int(y0 + cr[0] - 4), int(y0 + cr[1] + 5))
