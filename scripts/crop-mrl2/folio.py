# -*- coding: utf-8 -*-
"""쪽 아래에 **인쇄된 쪽번호**를 읽는다.

스캔하면서 낱장이 뒤바뀐 자리가 있다(인쇄 187·188쪽이 PDF 192·193쪽에 들어 있었다).
PDF 차례대로 번호를 매기면 그 구간이 통째로 어긋나므로, 인쇄된 쪽번호로 차례를 바로잡는다.
"""
import numpy as np
import mnum
from mnum import runs


def strip(a):
    H, W = a.shape[:2]
    return a[H - 135:H - 35], W


def boxes(a):
    """바닥 띠의 바깥쪽 끝에 붙은 굵은 숫자 덩어리.

    짝수 쪽은 왼쪽 끝에 「184  Ⅲ. 함수와 그래프」, 홀수 쪽은 오른쪽 끝에
    「10 무리함수  185」 꼴이다. 그래서 **바깥쪽 끝에서부터** 붙어 있는 글자만 이어 붙인다.
    """
    s, W = strip(a)
    ink = s.min(2) < 205
    out = []
    for side, (lo, hi) in ((0, (0, int(W * 0.22))), (1, (int(W * 0.78), W))):
        b = ink[:, lo:hi]
        for y0, y1 in runs(b.sum(1) > 3, gap=4):
            if not (16 <= y1 - y0 <= 42):
                continue
            gl = [(g0, g1) for g0, g1 in runs(b[y0:y1].any(0), gap=4) if g1 - g0 >= 4]
            if not gl:
                continue
            if side == 0:
                keep = [gl[0]]
                for g in gl[1:]:
                    if g[0] - keep[-1][1] > 12:
                        break
                    keep.append(g)
            else:
                keep = [gl[-1]]
                for g in reversed(gl[:-1]):
                    if keep[0][0] - g[1] > 12:
                        break
                    keep.insert(0, g)
            x0, x1 = keep[0][0], keep[-1][1]
            if not (18 <= x1 - x0 <= 92):
                continue
            out.append((lo, y0, y1, x0, x1))
    return s, out


def read_page(a, ex, ey, k=7):
    from PIL import Image
    s, bs = boxes(a)
    best = None
    for lo, y0, y1, x0, x1 in bs:
        nd = max(1, min(3, int(round((x1 - x0) / 19.5))))
        prof = (s[y0:y1, lo:lo + s.shape[1] - lo].min(2) < 205).sum(0).astype(int)
        cuts = [x0]
        if nd >= 2:
            step = (x1 - x0) / float(nd)
            for q in range(1, nd):
                c = int(x0 + step * q)
                w = range(max(x0 + 6, c - 6), min(x1 - 6, c + 7))
                w = list(w) or [c]
                cuts.append(min(w, key=lambda t: prof[t]))
        cuts.append(x1)
        vs = []
        for g0, g1 in zip(cuts[:-1], cuts[1:]):
            sub = s[y0:y1, lo + g0:lo + g1]
            b = (sub.min(2) < 205).astype(np.float32)
            if b.sum() < 8:
                vs = []
                break
            im = Image.fromarray((b * 255).astype(np.uint8)).resize((16, 24), Image.BILINEAR)
            v = np.asarray(im, np.float32).ravel() / 255.0
            n = np.linalg.norm(v)
            if not n:
                vs = []
                break
            vs.append(v / n)
        if not vs:
            continue
        sim = np.array(vs) @ ex.T
        top = np.argpartition(-sim, k, axis=1)[:, :k]
        ds = []
        for r in range(len(vs)):
            sc = np.zeros(10)
            for d, w in zip(ey[top[r]], sim[r, top[r]]):
                sc[d] += w
            ds.append(int(sc.argmax()))
        n = int(''.join(str(d) for d in ds))
        if best is None or len(ds) > best[1]:
            best = (n, len(ds))
    return None if best is None else best[0]
