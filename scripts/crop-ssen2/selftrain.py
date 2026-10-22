"""본문에서 이미 번호가 확정된 라벨들로 숫자 틀을 다시 만든다.

빠른정답(스캔)으로 만든 틀은 본문 숫자와 획 굵기·색이 달라서 자주 빗나갔다.
본문 자체에서 배우면 그 책의 글꼴을 그대로 익힌다.
"""
import numpy as np, io, json, pickle
from PIL import Image
from scipy import ndimage
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from repmask import repmask
sys.path.insert(0, r'C:\Users\USER\studycheck\scripts\crop-ssen')
from digits import Reader, glyphs
import s2det


def mask_of(a, s):
    if s['kind'] == 'rep':
        return repmask(a[s['y0']:s['y1'], s['x0']:s['x1']])
    sub = a[s['y0']:s['y1'], max(0, s['x0'] - 1):s['x1'] + 1]
    if sub.size == 0:
        return None
    L = (sub.astype(int) @ [299, 587, 114]) // 1000
    return L < 205


def ncomp(m):
    """가로로 몇 덩어리인지 — 넷이 아니면 배우기에 못 쓴다"""
    ys = np.where(m.any(1))[0]; xs = np.where(m.any(0))[0]
    if not len(ys):
        return 0
    mm = m[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
    lab, n = ndimage.label(mm)
    sp = sorted([sl[1].start, sl[1].stop] for i, sl in enumerate(ndimage.find_objects(lab))
                if (lab[sl] == i + 1).sum() >= 6)
    out = []
    for x0, x1 in sp:
        if out and x0 < out[-1][1] - 1:
            out[-1][1] = max(out[-1][1], x1)
        else:
            out.append([x0, x1])
    return len(out)
