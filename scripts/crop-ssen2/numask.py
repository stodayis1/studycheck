"""번호 라벨에서 숫자 넉 자만 떼어낸다.

「1046 • 중 •」처럼 난이도 점이 바로 옆에 붙으면 한 덩어리로 잡혀
뒤쪽 점까지 글자로 세게 된다. 번호는 늘 맨 왼쪽 넉 자이므로
가로로 끊어 **왼쪽 네 덩어리만** 남긴다.
"""
import numpy as np
from scipy import ndimage


def left4(m):
    ys = np.where(m.any(1))[0]
    if not len(ys):
        return None
    lab, n = ndimage.label(m)
    sp = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if (lab[sl] == i + 1).sum() < 8:
            continue
        sp.append([sl[1].start, sl[1].stop, i + 1])
    sp.sort()
    cols = []           # 가로로 겹치는 조각은 한 글자로 합친다
    for x0, x1, idx in sp:
        if cols and x0 < cols[-1][1] - 1:
            cols[-1][1] = max(cols[-1][1], x1); cols[-1][2].append(idx)
        else:
            cols.append([x0, x1, [idx]])
    if len(cols) < 4:
        return m
    keep = {i for c in cols[:4] for i in c[2]}
    out = np.zeros_like(m)
    for i in keep:
        out |= (lab == i)
    return out
