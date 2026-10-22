"""빠른정답 쪽에서 번호 라벨을 읽는 차례대로 모은다.

쪽마다 왼 단을 다 읽고 오른 단으로 넘어간다. 한 줄에 넷씩 들어가지만
정답이 길면(분수·식) 두 칸을 차지해 줄마다 개수가 다르다.
단계 딱지(B단계)는 키가 커서 번호와 구분된다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage
import s2det


def labels(pi, name='quick2.pdf'):
    a = s2det.page(name, pi)
    H, W = a.shape[:2]
    hv = np.array(Image.fromarray(a).convert('HSV')).astype(int)
    HH, SS, VV = hv[..., 0], hv[..., 1], hv[..., 2]
    sat = (SS > 42) & (VV > 42)
    qm = {'A': sat & ((HH <= 24) | (HH >= 235)),
          'B': sat & (HH >= 55) & (HH <= 125),
          'C': sat & (HH >= 126) & (HH <= 185)}
    out = []
    for st, m in qm.items():
        lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, 7))))
        for i, s in enumerate(ndimage.find_objects(lab)):
            y0, y1, x0, x1 = s[0].start, s[0].stop, s[1].start, s[1].stop
            if 15 <= y1 - y0 <= 28 and 40 <= x1 - x0 <= 66 and y0 > H * 0.045:
                out.append(dict(pg=pi, st=st, y0=int(y0), y1=int(y1),
                                x0=int(x0), x1=int(x1)))
    mid = W // 2
    rows = []
    for half in (0, 1):
        side = sorted([r for r in out if (r['x0'] < mid) == (half == 0)],
                      key=lambda r: r['y0'])
        cur = []
        for r in side:
            if cur and r['y0'] - cur[0]['y0'] < 14:
                cur.append(r)
            else:
                rows += sorted(cur, key=lambda q: q['x0'])
                cur = [r]
        rows += sorted(cur, key=lambda q: q['x0'])
    return a, rows
