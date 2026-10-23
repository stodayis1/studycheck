# -*- coding: utf-8 -*-
"""맞춰진 번호로 **이 책 숫자 글꼴을 스스로 배운다**.

뭉치 나누기만으로는 6 과 8 이 안 갈렸다. 하지만 정렬로 1,200개 넘는 번호가 확정됐으니
그 글자들에 이미 정답(0~9)이 붙어 있다. 그걸 본보기 삼아 다시 읽으면 훨씬 또렷해진다.
"""
import json
import io
import numpy as np


def train(X, own, rows, pair, strict=False, S=None):
    """글자 → 숫자 본보기 모으기 (네 글자로 또렷이 쪼개진 번호만)

    strict 면 **읽은 값과 붙인 번호가 같은 문항만** 본보기로 쓴다 — 틀린 읽기를 되먹이지 않게.
    """
    byc = {}
    for k, (i, j) in enumerate(own):
        byc.setdefault(i, []).append((j, k))
    ex, ey = [], []
    for i, n in pair.items():
        g = sorted(byc.get(i, []))
        if len(g) != 4:
            continue
        t = '%04d' % n
        if strict and S is not None and S[i] != t:
            continue
        for (j, k), ch in zip(g, t):
            ex.append(X[k])
            ey.append(int(ch))
    return np.array(ex, np.float32), np.array(ey, np.int8)


def centroids(ex, ey, k=14):
    """숫자마다 본보기를 k 덩어리로 나눠 둔다 (빛깔·굵기가 달라 하나로는 모자라다)"""
    out = []
    rng = np.random.RandomState(7)
    for d in range(10):
        V = ex[ey == d]
        if len(V) == 0:
            continue
        kk = min(k, len(V))
        C = V[rng.choice(len(V), kk, replace=False)].copy()
        for _ in range(25):
            lab = (V @ C.T).argmax(1)
            for c in range(kk):
                m = lab == c
                if m.any():
                    v = V[m].mean(0)
                    nn = np.linalg.norm(v)
                    if nn:
                        C[c] = v / nn
        for c in range(kk):
            out.append((d, C[c]))
    D = np.array([d for d, _ in out], np.int8)
    M = np.array([v for _, v in out], np.float32)
    return D, M


def knn(X, own, rows, ex, ey, k=7, chunk=400):
    """본보기 **전체**와 견줘 가까운 k개로 투표한다.

    대표점(뭉치 평균)만 쓰면 6 과 8 처럼 닮은 글자에서 틀린다.
    본보기가 5천 장쯤이라 통째로 견줘도 금방 끝난다.
    """
    byc = {}
    for t, (i, j) in enumerate(own):
        byc.setdefault(i, []).append((j, t))
    idx = []
    for i in range(len(rows)):
        g = sorted(byc.get(i, []))
        idx.append([t for _, t in g])
    flat = [t for g in idx for t in g]
    out = np.zeros(len(X), np.int8)
    for a in range(0, len(flat), chunk):
        sel = flat[a:a + chunk]
        sim = X[sel] @ ex.T
        top = np.argpartition(-sim, k, axis=1)[:, :k]
        for r, t in enumerate(sel):
            v = ey[top[r]]
            w = sim[r, top[r]]
            sc = np.zeros(10)
            for d, s in zip(v, w):
                sc[d] += s
            out[t] = int(sc.argmax())
    S = []
    for g in idx:
        S.append(''.join(str(int(out[t])) for t in g))
    return S


def read(X, own, rows, D, M):
    """후보마다 글자를 읽어 문자열로"""
    byc = {}
    for k, (i, j) in enumerate(own):
        byc.setdefault(i, []).append((j, k))
    S = []
    for i in range(len(rows)):
        g = sorted(byc.get(i, []))
        if not g:
            S.append('')
            continue
        sim = X[[k for _, k in g]] @ M.T
        best = sim.argmax(1)
        S.append(''.join(str(int(D[b])) for b in best))
    return S
