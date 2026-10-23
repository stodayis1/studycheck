# -*- coding: utf-8 -*-
"""번호 오른쪽의 **꼬리표**를 가른다.

  · 「대표 문제」 — 연보라 알약. **유형이 여기서 시작한다** (가장 쓸모 있는 신호)
  · 「유형 11」  — 유형점검 문항이 어느 유형인지 가리킨다
  · 하·중·상    — 난이도 동그라미
  · 「학평 기출」 — 출처 꼬리표 (오른쪽 끝에 있어 여기선 안 본다)
"""
import numpy as np
from PIL import Image
import mnum


def strip(a, r, reach=190):
    y0 = max(0, r['y0'] - 6)
    y1 = min(a.shape[0], r['y1'] + 6)
    # 번호 폭은 「1111」 48px ~ 「0088」 95px 로 들쑥날쑥하다 → **글자 상자의 오른쪽 끝**에서 시작한다
    nx = r['gx'][-1][1] if r.get('gx') else r['x0'] + 90
    x0 = nx + 8
    x1 = min(a.shape[1], nx + reach)
    return a[y0:y1, x0:x1], x0


def badges(a, r, minw=20, hole=7, th=0.25):
    sub, x0 = strip(a, r)
    if sub.size == 0:
        return []
    h = np.array(Image.fromarray(sub).convert('HSV')).astype(int)
    H, S, V = h[..., 0], h[..., 1], h[..., 2]
    m = (S >= 9) & (V >= 120)
    # 알약 안의 **흰 글자**가 세로줄을 군데군데 끊어 놓는다 → 금을 낮추고 작은 틈은 잇는다
    cols = m.mean(0) > th
    out = []
    s = None
    hole_n = hole
    hole = 0
    for i, v in enumerate(list(cols) + [False] * 10):
        if v:
            if s is None:
                s = i
            hole = 0
        elif s is not None:
            hole += 1
            if hole < hole_n:
                continue
            i = i - hole + 1
            if i - s >= minw:
                seg = slice(s, i)
                hh = H[:, seg][m[:, seg]]
                ss = S[:, seg][m[:, seg]]
                if hh.size:
                    out.append(dict(x=int(x0 + s), w=int(i - s),
                                    h=int(np.median(hh)), s=int(np.median(ss))))
            s = None
            hole = 0
    return out
