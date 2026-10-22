"""지면에 같이 찍힌 부속물을 찾는다 — 번호 말고 나머지.

크기와 색으로 가른다 (200dpi 기준, 쎈 공통수학2 스캔본):
  · 소단원 배지 `01-1`      주황  h50 w100
  · 유형 배지   `유형 09`    초록  h49 w 99
  · 대표문제                 갈색  h40 w195
  · 묶음 지시문 `[0001~0003]` 빨강  h27 w148
  · 난이도 딱지 `하`·`•중•`  주황/파랑 h27 w70
  · 집중공략                 주황  h62 w71
배지 두 가지는 크기가 같고 **색만 다르다** — 소단원은 A, 유형은 B.
"""
import numpy as np
from scipy import ndimage
import s2det

KINDS = [
    # (이름,      색, 높이범위,  너비범위)
    # 배지 높이는 스캔 상태에 따라 40~50 사이에서 흔들린다 (171쪽 유형 05 는 43)
    ('sub',      'A', (38, 58), (86, 120)),    # 소단원 배지
    ('type',     'B', (38, 58), (86, 120)),    # 유형 배지
    ('rep',      'A', (34, 46), (150, 230)),   # 대표문제
    ('bracket',  'A', (22, 34), (120, 178)),   # 묶음 지시문
    ('num',      None, (17, 34), (50, 90)),    # 번호 또는 난이도 딱지
    ('focus',    'A', (56, 70), (60, 85)),     # 집중공략
]


def furniture(a, dil=15):
    H, W = a.shape[:2]
    out = []
    for st, m in s2det.colmask(a).items():
        lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, dil))))
        for i, sl in enumerate(ndimage.find_objects(lab)):
            y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
            hh, ww = y1 - y0, x1 - x0
            if y0 < H * 0.03 or y1 > H * 0.97 or x0 > W * 0.92:
                continue
            for name, want, (h0, h1), (w0, w1) in KINDS:
                if (want is None or want == st) and h0 <= hh <= h1 and w0 <= ww <= w1:
                    out.append(dict(what=name, st=st, y0=int(y0), y1=int(y1),
                                    x0=int(x0), x1=int(x1)))
                    break
    out.sort(key=lambda r: (r['x0'] > W // 2, r['y0']))
    return out


def columns(nums, W):
    """번호들의 x 로 단의 왼쪽 모서리를 잡는다. 반쪽마다 하나 이상일 수 있다
    (A단계는 한 반쪽에 문항이 가로로 둘 들어가기도 한다)."""
    ed = {0: [], 1: []}
    for side in (0, 1):
        xs = sorted(r['x0'] for r in nums if r['side'] == side)
        for x in xs:
            if ed[side] and x - ed[side][-1][-1] <= 24:
                ed[side][-1].append(x)
            else:
                ed[side].append([x])
    return {s: [int(np.median(g)) for g in v] for s, v in ed.items()}


def at_left_edge(r, edges, W, tol=22):
    side = 0 if r['x0'] < W // 2 else 1
    return any(abs(r['x0'] - e) <= tol for e in edges.get(side, []))
