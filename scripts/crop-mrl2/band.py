# -*- coding: utf-8 -*-
"""「유형 10  한 직선에 평행 또는 수직인 직선의 방정식」 파란 띠를 찾는다.

이 책은 유형 이름을 **책이 직접 달아 준다**. 스캔본이라 글자는 없지만, 띠를 잘라 모아
사람(또는 나)이 눈으로 읽으면 그대로 유형표가 된다.
"""
import numpy as np
from PIL import Image
import mnum
from mnum import runs


def mask(a):
    """하얗지도 검지도 않은 **채색 바탕** — 띠 색이 단원마다 달라 빛깔은 안 가린다"""
    h = np.array(Image.fromarray(a).convert('HSV')).astype(int)
    S, V = h[..., 1], h[..., 2]
    return (S >= 13) & (V >= 105)


def bands(pi, a=None, frac=0.5, hmin=24, hmax=80):
    if a is None:
        a = mnum.page(pi)
    H, W = a.shape[:2]
    m = mask(a)
    out = []
    for col, (lo, hi) in enumerate([(int(W * 0.04), W // 2 - 10),
                                    (W // 2 + 10, int(W * 0.97))]):
        wide = m[:, lo:hi].mean(1) > frac
        for y0, y1 in runs(wide, gap=4):
            if not (hmin <= y1 - y0 <= hmax):
                continue
            if y0 < H * 0.04 or y1 > H * 0.96:
                continue
            cols = m[y0:y1, lo:hi].mean(0) > 0.5
            xs = np.nonzero(cols)[0]
            if not len(xs):
                continue
            out.append(dict(pg=pi, col=col, y0=int(y0), y1=int(y1),
                            x0=int(lo + xs[0]), x1=int(lo + xs[-1]) + 1))
    out.sort(key=lambda r: (r['col'], r['y0']))
    return a, out
