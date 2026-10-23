# -*- coding: utf-8 -*-
"""번호칸을 네 글자로 쪼갠다. 마플시너지는 네 자리가 모두 색이라 쉽다."""
import numpy as np
from PIL import Image
import mnum

GW, GH = 16, 24


def cut4(prof, lo, hi, wmin=14, wmax=42):
    W = hi - lo
    if W < wmin * 4:
        return None
    best = None
    for c1 in range(lo + wmin, hi - wmin * 3 + 1):
        if c1 - lo > wmax:
            break
        for c2 in range(c1 + wmin, hi - wmin * 2 + 1):
            if c2 - c1 > wmax:
                break
            for c3 in range(c2 + wmin, hi - wmin + 1):
                if c3 - c2 > wmax:
                    break
                if hi - c3 > wmax:
                    continue
                v = prof[c1] + prof[c2] + prof[c3]
                if best is None or v < best[0]:
                    best = (v, c1, c2, c3)
    return None if best is None else best[1:]


def glyphs(a, r):
    sub = a[r['y0']:r['y1'], r['x0']:r['x1']]
    ink = sub.min(2) < 215
    cols = np.nonzero(ink.any(0))[0]
    if len(cols) < 40:
        return []
    lo, hi = int(cols[0]), int(cols[-1]) + 1
    cc = cut4(ink.sum(0).astype(int), lo, hi)
    if cc is None:
        return []
    out = []
    for a0, a1 in zip((lo,) + cc, cc + (hi,)):
        g = ink[:, a0:a1]
        rs = np.nonzero(g.any(1))[0]
        cs = np.nonzero(g.any(0))[0]
        if not len(rs) or not len(cs):
            return []
        out.append([r['x0'] + a0 + int(cs[0]), r['x0'] + a0 + int(cs[-1]) + 1,
                    r['y0'] + int(rs[0]), r['y0'] + int(rs[-1]) + 1])
    return out


def patch(a, g):
    sub = a[g[2]:g[3], g[0]:g[1]]
    if sub.size == 0:
        return None
    b = (sub.min(2) < 215).astype(np.float32)
    if b.sum() < 12:
        return None
    im = Image.fromarray((b * 255).astype(np.uint8)).resize((GW, GH), Image.BILINEAR)
    v = np.asarray(im, np.float32).ravel() / 255.0
    n = np.linalg.norm(v)
    return v / n if n else None
