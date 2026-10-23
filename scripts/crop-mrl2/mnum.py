# -*- coding: utf-8 -*-
"""유형만렙 공통수학2 — 문항 번호칸 찾기 (3판, 색을 안 쓴다)

이 책의 번호는 세 가지 꼴로 인쇄돼 있다.
  · A단계      : 앞자리 0 은 회색, 뜻있는 자리만 초록   (0001)
  · 유형 꼭지   : 네 자리 모두 남색, 옆에 난이도 동그라미  (0168 하)
  · 유형점검·실력향상 : 네 자리 모두 **검정**, 옆에 「유형 11」 꼬리표 (0086)
색으로 찾으면 검정 번호를 통째로 놓친다(19쪽 등 60쪽 넘게).

그래서 색을 버리고 **생김새**로 찾는다 —
단의 왼쪽 여백에서 시작하는, 높이 24~38px 의 **네 자리 숫자 덩어리**.
문제 본문도 같은 여백에서 시작하지만 글자 폭·개수가 다르다.
"""
import numpy as np
import pymupdf
from scipy import ndimage

DPI = 200
_d = {}


def doc(name='q.pdf'):
    if name not in _d:
        _d[name] = pymupdf.open(name)
    return _d[name]


def page(pi, name='q.pdf', dpi=DPI):
    pm = doc(name)[pi].get_pixmap(dpi=dpi)
    return np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, 3).copy()


def runs(flags, gap=1):
    """참인 칸이 이어지는 구간 [(a,b)…]"""
    out = []
    a = None
    off = 0
    for i, v in enumerate(flags):
        if v:
            if a is None:
                a = i
            off = 0
        elif a is not None:
            off += 1
            if off >= gap:
                out.append((a, i - off + 1))
                a = None
    if a is not None:
        out.append((a, len(flags)))
    return out


def margins(a, k=3, nmin=3, apart=55):
    """단마다 글줄이 시작하는 x 들. 단 안에서 번호가 두 줄로 놓이기도 해 **여러 개**를 준다."""
    H, W = a.shape[:2]
    ink = a.min(2) < 205
    out = {}
    for col, (lo, hi) in enumerate([(int(W * 0.03), W // 2), (W // 2, int(W * 0.97))]):
        xs = []
        band = ink[int(H * 0.05):int(H * 0.96), lo:hi].copy()
        # 스캔 가장자리의 제본 구멍·세로줄은 **모든 줄에 잉크**를 만들어 글줄 나누기를 망친다.
        # 거의 모든 줄에 걸쳐 있는 세로칸은 지우고 센다.
        # 스캔 얼룩이 거의 모든 줄에 1~2 화소씩 있어 any() 로는 쪽 전체가 한 줄이 된다.
        # 글줄은 잉크가 수백 화소이므로 **화소 수**로 끊는다.
        for y0, y1 in runs(band.sum(1) > 8, gap=3):
            # 쪽마다 세로로 난 2px 스캔 줄이 「글줄 시작」으로 잡혀 진짜 여백을 가린다.
            # 폭 4px 미만 조각은 글자가 아니다.
            g = [(s, e) for s, e in runs(band[y0:y1].any(0), gap=3) if e - s >= 4]
            if g:
                xs.append(lo + g[0][0])
        if not xs:
            continue
        xs.sort()
        picked = []
        pool = list(xs)
        for _ in range(k):
            best, bn = None, 0
            for x in pool:
                n = sum(1 for v in pool if x <= v <= x + 14)
                if n > bn:
                    bn, best = n, x
            if best is None or bn < nmin:
                break
            picked.append(best)
            pool = [v for v in pool if not (best - apart < v < best + apart)]
        out[col] = picked
    return out


def numbers(pi, a=None):
    """번호칸 — 여백에서 시작하는 네 자리 숫자 줄"""
    if a is None:
        a = page(pi)
    H, W = a.shape[:2]
    ink = a.min(2) < 205
    out = []
    for col, Ls in margins(a).items():
      for L in Ls:
        lo = max(0, L - 6)
        hi = min(W, L + 125)
        band = ink[:, lo:hi]
        top, bot = int(H * 0.05), int(H * 0.96)
        for y0, y1 in runs(band[top:bot].sum(1) > 8, gap=3):
            y0 += top
            y1 += top
            h = y1 - y0
            if not (23 <= h <= 40):
                continue
            cols = band[y0:y1].any(0)
            gl = [(lo + s, lo + e) for s, e in runs(cols, gap=3) if e - s >= 4]
            if not gl or gl[0][0] > L + 10:
                continue
            # 네 자리 숫자는 서로 바짝 붙어 한 덩어리로 보이기도 한다.
            # 여백에서 시작해 **12px 안쪽으로 이어지는 동안** 이어 붙이고, 그 폭을 잰다.
            # 한글 본문은 글자가 다 붙어 폭이 102 를 넘고, 짧은 머리글은 55 에 못 미친다.
            keep = [gl[0]]
            for s, e in gl[1:]:
                if s - keep[-1][1] > 12:
                    break
                keep.append((s, e))
            span = keep[-1][1] - keep[0][0]
            if not (40 <= span <= 104):
                continue
            out.append(dict(pg=pi, col=col, y0=int(y0), y1=int(y1),
                            x0=int(keep[0][0]), x1=int(keep[-1][1]),
                            ng=len(keep), L=int(L)))
    out.sort(key=lambda r: (r['col'], r['y0']))
    return a, out
