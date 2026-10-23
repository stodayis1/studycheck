# -*- coding: utf-8 -*-
"""단 사이의 **빈 띠**(gutter)를 찾아 가로 경계를 정한다.

가운데를 W/2 로 잡으면 안 된다 — 책마다 단이 가운데에 있지 않다.
마플시너지는 왼쪽 단이 x≈850 까지 가는데 W//2 는 826 이라 **모든 문항이 35px 잘렸다**(91%).
"""
import numpy as np


def find(a, lo=0.45, hi=0.60, band=14):
    """글이 가장 적은 세로 띠의 (시작, 끝)"""
    H, W = a.shape[:2]
    ink = (a.min(2) < 205)[int(H * 0.06):int(H * 0.94)]
    col = ink.sum(0).astype(float)
    x0, x1 = int(W * lo), int(W * hi)
    best, bx = None, (W // 2 - band // 2, W // 2 + band // 2)
    for x in range(x0, x1 - band):
        v = col[x:x + band].sum()
        if best is None or v < best:
            best, bx = v, (x, x + band)
    # 빈 띠를 양쪽으로 넓힌다
    s, e = bx
    while s > x0 and col[s - 1] < 2:
        s -= 1
    while e < x1 and col[e] < 2:
        e += 1
    return s, e


def margins(a, lo=0.02, hi=0.99):
    """쪽 전체의 왼쪽·오른쪽 글 끝"""
    H, W = a.shape[:2]
    ink = (a.min(2) < 205)[int(H * 0.06):int(H * 0.94)]
    col = ink.sum(0)
    xs = np.nonzero(col > 2)[0]
    if not len(xs):
        return int(W * 0.05), int(W * 0.95)
    return int(xs[0]), int(xs[-1]) + 1
