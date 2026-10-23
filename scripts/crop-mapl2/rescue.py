# -*- coding: utf-8 -*-
"""못과 못 사이에 빠진 번호를 **느슨한 기준으로 다시 훑는다**.

본 검출은 가짜를 줄이려고 조건을 죄어 놨다. 그러다 보니
  · 「1121 대표 문제」처럼 꼬리표가 바짝 붙은 번호
  · 글자가 얇게 찍혀 대괄호로 오해받은 번호
같은 몇 개를 놓친다. 앞뒤 번호가 확정된 **좁은 구간**에서는 가짜 걱정이 적으므로
거기서만 기준을 풀어 다시 본다.
"""
import numpy as np
import mnum
from mnum import runs


def scan(pg, col, y0, y1, L, span=130):
    """쪽 pg 의 col 단, y0~y1 구간에서 여백 L 에 붙은 숫자칸 후보"""
    a = mnum.page(pg)
    ink = a.min(2) < 205
    lo, hi = max(0, L - 8), min(a.shape[1], L + span)
    band = ink[:, lo:hi]
    out = []
    for q0, q1 in runs(band[y0:y1].sum(1) > 8, gap=3):
        q0 += y0
        q1 += y0
        if not (20 <= q1 - q0 <= 42):
            continue
        gl = [(s, e) for s, e in runs(band[q0:q1].any(0), gap=3) if e - s >= 4]
        if not gl or gl[0][0] > (L - lo) + 14:
            continue
        keep = [gl[0]]
        for s, e in gl[1:]:
            if s - keep[-1][1] > 14 or e - keep[0][0] > 112:
                break
            keep.append((s, e))
        w = keep[-1][1] - keep[0][0]
        if not (42 <= w <= 112):
            continue
        out.append(dict(pg=pg, col=col, y0=int(q0), y1=int(q1),
                        x0=int(lo + keep[0][0]), src='r'))
    return a, out
