# -*- coding: utf-8 -*-
"""문항 그림 자르기.

가로는 그 번호가 선 **칸**만큼 — 한 줄에 번호가 둘 나란히 놓인 자리(0626·0627)에서는
오른쪽 번호 앞까지만 자른다. 세로는 번호 머리부터 **다음 번호 머리 앞**까지,
단 끝이면 단 바닥까지. 잘라 낸 뒤 위아래 빈 줄을 털어 낸다.
"""
import numpy as np
import mnum

TOP = 0.055
BOT = 0.955


def ink(a):
    return a.min(2) < 205


def trim(a, pad=4):
    m = ink(a)
    rs = np.nonzero(m.sum(1) > 2)[0]
    if not len(rs):
        return None
    y0 = max(0, rs[0] - pad)
    y1 = min(a.shape[0], rs[-1] + 1 + pad)
    return a[y0:y1]


def spans(rows, keys, W):
    """같은 쪽·단의 번호들을 줄로 묶어, 번호마다 가로 칸을 정한다"""
    mid = W // 2
    out = {}
    for (pg, col), ks in keys.items():
        lo = min(rows[k]['x0'] for k in ks) - 12
        hi = (mid - 14) if col == 0 else int(W * 0.965)
        ks = sorted(ks, key=lambda k: (rows[k]['y0'], rows[k]['x0']))
        lines = []
        for k in ks:
            if lines and rows[k]['y0'] - rows[lines[-1][0]]['y0'] < 22:
                lines[-1].append(k)
            else:
                lines.append([k])
        for L in lines:
            L.sort(key=lambda k: rows[k]['x0'])
            for j, k in enumerate(L):
                x0 = (rows[k]['x0'] - 12) if j else lo
                x1 = (rows[L[j + 1]]['x0'] - 14) if j + 1 < len(L) else hi
                out[k] = (max(0, x0), x1)
    return out


def cuts(rows, asg):
    """번호마다 (쪽, x0, x1, y0, y1)"""
    keys = {}
    for k in asg:
        keys.setdefault((rows[k]['pg'], rows[k]['col']), []).append(k)
    a0 = mnum.page(rows[0]['pg'])
    H, W = a0.shape[:2]
    sp = spans(rows, keys, W)
    out = {}
    for (pg, col), ks in keys.items():
        ks.sort(key=lambda k: (rows[k]['y0'], rows[k]['x0']))
        for i, k in enumerate(ks):
            x0, x1 = sp[k]
            y0 = max(int(H * TOP), rows[k]['y0'] - 12)
            # 다음 칸 — 같은 가로 칸에서 아래에 있는 가장 가까운 번호
            y1 = int(H * BOT)
            for q in ks[i + 1:]:
                if rows[q]['y0'] <= rows[k]['y0'] + 8:
                    continue
                qx0, qx1 = sp[q]
                if qx1 <= x0 + 6 or qx0 >= x1 - 6:   # 가로로 안 겹치면 딴 칸
                    continue
                y1 = max(y0 + 40, rows[q]['y0'] - 14)
                break
            out[k] = (pg, x0, x1, y0, y1)
    return out
