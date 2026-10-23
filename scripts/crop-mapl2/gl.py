# -*- coding: utf-8 -*-
"""번호 글자들을 모아 **스스로 묶는다**(k-means). 묶음 열 개가 곧 0~9 다.

이 책은 번호가 초록·남색·검정 세 빛깔이라 미리 배운 글꼴로는 못 읽는다.
그래서 글자를 다 모아 생김새로 열 뭉치로 나누고, 뭉치 대표 그림을 한 번 눈으로 보고
0~9 를 붙인다. 그 다음부터는 기계가 읽는다.
"""
import io
import json
import numpy as np
import mnum

GW, GH = 16, 24


def patch(a, g):
    sub = a[g[2]:g[3], g[0]:g[1]]
    if sub.size == 0:
        return None
    b = (sub.min(2) < 205).astype(np.float32)
    if b.sum() < 8:
        return None
    from PIL import Image
    im = Image.fromarray((b * 255).astype(np.uint8)).resize((GW, GH), Image.BILINEAR)
    v = np.asarray(im, np.float32).ravel() / 255.0
    n = np.linalg.norm(v)
    return v / n if n else None


def collect(rows, cache=None):
    X, own = [], []
    bypg = {}
    for i, r in enumerate(rows):
        bypg.setdefault(r['pg'], []).append(i)
    for pg in sorted(bypg):
        a = mnum.page(pg)
        for i in bypg[pg]:
            for j, g in enumerate(rows[i]['gx']):
                v = patch(a, g)
                if v is None:
                    continue
                X.append(v)
                own.append((i, j))
    return np.array(X, np.float32), own


def kmeans(X, k=10, iters=40, seed=0):
    rng = np.random.RandomState(seed)
    C = X[rng.choice(len(X), k, replace=False)].copy()
    for _ in range(iters):
        d = X @ C.T
        lab = d.argmax(1)
        for c in range(k):
            m = lab == c
            if m.any():
                v = X[m].mean(0)
                n = np.linalg.norm(v)
                if n:
                    C[c] = v / n
    return C, lab
