"""번호 라벨 후보를 너그럽게 모은다 — 걸러내기는 읽은 값과 차례로 한다."""
import numpy as np
from scipy import ndimage
import s2det


def wide(a, dil=15):
    out = []
    for st, m in s2det.colmask(a).items():
        lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, dil))))
        for i, s in enumerate(ndimage.find_objects(lab)):
            y0, y1, x0, x1 = s[0].start, s[0].stop, s[1].start, s[1].stop
            hh, ww = y1 - y0, x1 - x0
            kind = ('num' if 17 <= hh <= 34 and 50 <= ww <= 170 else
                    'rep' if 34 <= hh <= 46 and 150 <= ww <= 230 else None)
            if kind:
                out.append(dict(st=st, kind=kind, y0=int(y0), y1=int(y1),
                                x0=int(x0), x1=int(x1)))
    return out
