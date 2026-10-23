# -*- coding: utf-8 -*-
"""① 읽은 값이 **정확히 맞는 것만** 못(anchor)으로 박고, ② 못과 못 사이를 자리로 채운다.

가짜 후보(수식 줄·「유형 14」 꼬리표·묶음 지시문)가 진짜 번호를 가로채면 그 뒤가
통째로 한 칸씩 밀린다. 그래서 약한 짝짓기는 아예 안 하고 구멍으로 남긴 다음,
구멍 양쪽의 못 사이에서 **후보 수와 빠진 번호 수가 같을 때만** 차례로 채운다.
수가 안 맞으면 손대지 않고 「봐야 할 자리」로 남긴다.
"""
import numpy as np


def anchors(S, N=1272):
    """읽은 값이 번호와 꼭 맞고, 그 번호를 혼자 차지하는 후보만"""
    want = {}
    for i, s in enumerate(S):
        if len(s) != 4:
            continue
        try:
            n = int(s)
        except ValueError:
            continue
        if 1 <= n <= N:
            want.setdefault(n, []).append(i)
    a = {}
    for n, idx in want.items():
        if len(idx) == 1:
            a[idx[0]] = n
    # 차례가 뒤집힌 못은 버린다 (가장 긴 증가 부분열만 남긴다)
    ks = sorted(a)
    vs = [a[k] for k in ks]
    m = len(vs)
    best = [1] * m
    prev = [-1] * m
    for i in range(m):
        for j in range(i):
            if vs[j] < vs[i] and best[j] + 1 > best[i]:
                best[i] = best[j] + 1
                prev[i] = j
    if not m:
        return {}
    e = int(np.argmax(best))
    keep = []
    while e >= 0:
        keep.append(ks[e])
        e = prev[e]
    keep = set(keep)
    return {k: v for k, v in a.items() if k in keep}


def fill(rows, S, N=1272):
    a = anchors(S, N)
    ks = sorted(a)
    out = dict(a)
    holes = []
    seg = [(-1, 0)] + [(k, a[k]) for k in ks] + [(len(rows), N + 1)]
    for (k0, n0), (k1, n1) in zip(seg[:-1], seg[1:]):
        mids = list(range(k0 + 1, k1))
        nums = list(range(n0 + 1, n1))
        if not nums:
            continue
        if len(mids) == len(nums):
            for k, n in zip(mids, nums):
                out[k] = n
        elif len(mids) > len(nums):
            # 가짜가 섞인 구간 — 읽은 값이 가장 비슷한 후보들을 차례 지켜 고른다
            pick = best_subset([S[k] for k in mids], nums)
            if pick is None:
                holes.append(dict(between=(n0, n1), cands=len(mids), nums=len(nums)))
                continue
            for j, n in zip(pick, nums):
                out[mids[j]] = n
        else:
            holes.append(dict(between=(n0, n1), cands=len(mids), nums=len(nums)))
    return out, a, holes


def agree(s, n):
    t = '%04d' % n
    if len(s) != 4:
        return 0
    return sum(1 for a, b in zip(s, t) if a == b)


def best_subset(reads, nums):
    """후보 reads 에서 nums 개를 **차례 지켜** 골라 읽은 값이 가장 잘 맞게"""
    m, k = len(reads), len(nums)
    if k == 0 or m < k:
        return None
    NEG = -1e9
    dp = [[NEG] * (k + 1) for _ in range(m + 1)]
    bk = [[0] * (k + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = 0
    for i in range(1, m + 1):
        for j in range(1, min(k, i) + 1):
            a = dp[i - 1][j]                                   # 이 후보 버림
            b = dp[i - 1][j - 1] + agree(reads[i - 1], nums[j - 1])
            if b >= a:
                dp[i][j] = b
                bk[i][j] = 1
            else:
                dp[i][j] = a
                bk[i][j] = 0
    if dp[m][k] <= NEG / 2:
        return None
    out = []
    i, j = m, k
    while j > 0:
        if bk[i][j] == 1:
            out.append(i - 1)
            i -= 1
            j -= 1
        else:
            i -= 1
    return list(reversed(out))
