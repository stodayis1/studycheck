# -*- coding: utf-8 -*-
"""마플시너지 공통수학2 — 문항 번호 찾기.

이 책은 번호가 **네 자리 모두 청록색**이고 크기가 일정하다 (높이 42·너비 110).
유형만렙처럼 앞자리 0 이 회색이지도 않고, 구간마다 빛깔이 바뀌지도 않는다.
그래서 색 덩어리의 **크기**만으로 거의 다 걸린다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage
import mnum

page = mnum.page
doc = mnum.doc


def colmask(a):
    h = np.array(Image.fromarray(a).convert('HSV')).astype(int)
    H, S, V = h[..., 0], h[..., 1], h[..., 2]
    return (H >= 110) & (H <= 160) & (S > 70) & (V > 55)


def inkmask(a):
    """색을 안 가린 잉크. STEP2 서술형은 번호가 **회색**이라 색으로는 안 잡힌다."""
    return a.min(2) < 215


def numbers(pi, a=None, dil=11, mode='color'):
    if a is None:
        a = page(pi)
    H, W = a.shape[:2]
    m = colmask(a) if mode == 'color' else inkmask(a)
    lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, dil))))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        h, w = y1 - y0, x1 - x0
        # 「1111」은 1이 넷이라 폭이 70px 쯤밖에 안 된다 → 아래 금을 낮춘다
        if not (34 <= h <= 52 and 66 <= w <= 136):
            continue
        px = int((lab[sl] == i + 1).sum())
        if px < 1700:
            continue
        if y0 < H * 0.04 or y1 > H * 0.97:
            continue
        out.append(dict(pg=pi, y0=int(y0), y1=int(y1), x0=int(x0), x1=int(x1),
                        col=int(x0 > W // 2), px=px))
    out.sort(key=lambda r: (r['col'], r['y0'], r['x0']))
    return a, out
