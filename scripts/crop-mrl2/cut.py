# -*- coding: utf-8 -*-
"""문항 그림 자르기.

가로는 그 번호가 선 **칸**만큼 — 한 줄에 번호가 둘 나란히 놓인 자리(0626·0627)에서는
오른쪽 번호 앞까지만 자른다. 세로는 번호 머리부터 **다음 번호 머리 앞**까지,
단 끝이면 단 바닥까지. 잘라 낸 뒤 위아래 빈 줄을 털어 낸다.
"""
import collections
import io
import json
import os
import numpy as np
import mnum

TOP = 0.055
BOT = 0.955

HERE = os.path.dirname(os.path.abspath(__file__))


def bands():
    """유형 띠의 자리 — (쪽, 칸) → 띠들.

    세로 경계로 **다음 번호만** 보면, 유형 묶음의 **마지막 문항**은 아래에 번호가
    없어 단 바닥까지 잘린다. 그러면 다음 유형의 파란 띠와 개념 상자가 통째로
    딸려 들어가 학습지에 **다음 유형 개념이 노출된다** (2026-10-26, 53문항).
    띠 자리는 types.json 에 이미 적혀 있으니 그걸 경계로 쓴다.
    """
    by = collections.defaultdict(list)
    f = os.path.join(HERE, 'types.json')
    if not os.path.exists(f):
        return by
    for t in json.load(io.open(f, encoding='utf8')):
        by[(t['pg'], t['col'])].append(t)
    return by


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


def a_pg(pg):
    return mnum.page(pg)


def above_band(a, by, x0, x1, floor, look=130):
    """유형 띠 위에 붙은 배지·안내 줄까지 걷어 내고 끊을 자리를 돌려준다.

    띠(by) 에서 위로 look 픽셀을 보며 **가장 넓은 빈 띠**를 찾아 그 가운데를 쓴다.
    못 찾으면 띠 바로 위(-10)로 돌아간다.
    """
    lo = max(floor, by - look)
    if by - lo < 16:
        return by - 10
    band = a[lo:by, x0:x1]
    g = band[:, :, :3].astype(int)
    m = ((g.max(2) < 170) | ((g.max(2) - g.min(2)) > 60)).sum(1) > 2
    best, cur, start = None, 0, 0
    for i, v in enumerate(list(m) + [True]):
        if not v:
            if cur == 0:
                start = i
            cur += 1
        else:
            if cur >= 10 and (best is None or cur > best[1]):
                best = (start, cur)
            cur = 0
    if best is None:
        return by - 10
    return lo + best[0] + best[1] // 2


def cuts(rows, asg):
    """번호마다 (쪽, x0, x1, y0, y1)"""
    keys = {}
    for k in asg:
        keys.setdefault((rows[k]['pg'], rows[k]['col']), []).append(k)
    a0 = mnum.page(rows[0]['pg'])
    H, W = a0.shape[:2]
    sp = spans(rows, keys, W)
    bd = bands()
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
            # 다음 유형 띠도 경계다 — 묶음의 마지막 문항이 띠와 개념 상자를 삼킨다.
            # 띠 **바로 위**에는 「빈출」 배지와 「개념루트 ○쪽」 한 줄이 붙어 있으니
            # 띠에서 위로 거슬러 빈 띠를 찾아 거기서 끊는다.
            for t in bd.get((pg, col), []):
                if t['y0'] <= rows[k]['y0'] + 8 or t['y0'] >= y1:
                    continue
                if t['x1'] <= x0 + 6 or t['x0'] >= x1 - 6:
                    continue
                y1 = max(y0 + 40, above_band(a_pg(pg), t['y0'], x0, x1, y0 + 40))
            out[k] = (pg, x0, x1, y0, y1)
    return out
