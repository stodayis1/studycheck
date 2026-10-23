# -*- coding: utf-8 -*-
"""후보(1371개)와 **해설이 알려 준 번호 차례**(1~1272)를 맞춘다.

후보에는 본문 줄을 잘못 집은 가짜가 섞여 있고, 거꾸로 못 찾은 번호도 있을 수 있다.
글자를 읽은 결과가 군데군데 흐리므로(「?」·6과 8 못 가름) **한 줄 한 줄 따지지 않고**
두 줄을 통째로 정렬해서, 차례가 가장 잘 맞는 짝짓기를 고른다.
"""
import numpy as np

SKIP_C = -1.6      # 가짜 후보를 버리는 값
SKIP_N = -3.0      # 번호를 못 찾았다고 치는 값 (검출을 믿으므로 더 비싸게)


def score(s, n):
    """읽은 글자 s 와 번호 n 이 얼마나 맞는가 (-2 … +2)"""
    t = '%04d' % n
    best = -99
    for off in range(max(1, len(s) - 3)):
        u = s[off:off + 4]
        if len(u) < 4:
            break
        k = 0
        for a, b in zip(u, t):
            if a == b:
                k += 1
            elif a == 'x' and b in '68':
                k += 1
            elif a == '?':
                k += 0.35
        best = max(best, k)
    if best < 0:
        return -2.0
    return best - 2.0


def run(S, N=1272, band=None):
    M = len(S)
    # 띠는 **후보 수와 번호 수의 차이보다 넓어야** 한다. 좁으면 대각선이 띠 밖으로 나가
    # 짝이 하나도 안 맞는다 (후보 1465 : 번호 1272 일 때 실제로 그랬다).
    if band is None:
        band = abs(M - N) + 140
    NEG = -1e9
    prev = np.full(N + 1, NEG)
    prev[0] = 0.0
    for n in range(1, N + 1):
        prev[n] = prev[n - 1] + SKIP_N
    bt = np.zeros((M + 1, N + 1), np.int8)
    for i in range(1, M + 1):
        cur = np.full(N + 1, NEG)
        cur[0] = prev[0] + SKIP_C
        bt[i, 0] = 1
        lo = max(1, i - band)
        hi = min(N, i + band)
        for n in range(lo, hi + 1):
            a = prev[n] + SKIP_C                 # 1: 후보 버림
            b = cur[n - 1] + SKIP_N              # 2: 번호 못 찾음
            c = prev[n - 1] + score(S[i - 1], n)  # 3: 짝
            if c >= a and c >= b:
                cur[n] = c
                bt[i, n] = 3
            elif a >= b:
                cur[n] = a
                bt[i, n] = 1
            else:
                cur[n] = b
                bt[i, n] = 2
        prev = cur
    # 되짚기
    i, n = M, N
    pair = {}
    while i > 0 or n > 0:
        o = bt[i, n] if i > 0 else 2
        if o == 3:
            pair[i - 1] = n
            i -= 1
            n -= 1
        elif o == 1:
            i -= 1
        else:
            n -= 1
            if n < 0:
                break
    return pair
