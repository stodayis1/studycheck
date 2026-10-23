# -*- coding: utf-8 -*-
"""유형만렙 공통수학2 — 번호칸 찾기 (2판)

1판은 색 덩어리의 **오른쪽 끝**을 번호칸의 끝으로 봤는데 틀렸다.
번호는 **왼쪽 정렬**이고 글자 폭이 제각각이라(0009 와 0011) 오른쪽 끝이 10px 넘게 흔들린다.
게다가 앞자리 0 은 **회색**이라 색으로는 안 잡힌다.

그래서 이렇게 바꾼다.
  · 색 덩어리를 **씨앗**으로 삼아, 같은 줄에서 잉크가 이어지는 동안 **왼쪽으로 넓힌다**
    → 회색 0 까지 먹어서 번호칸 전체(0010)를 얻는다.
  · 그 왼쪽 끝은 단마다 **거의 고정**이다(스캔 기울기만큼만 흔들린다).
  · 묶음 지시문 「[0009~0011]」 은 「[」 때문에 **더 왼쪽에서 시작하고 훨씬 넓다** → 폭으로 가른다.
"""
import numpy as np
import pymupdf
from PIL import Image
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


def colmask(a):
    h = np.array(Image.fromarray(a).convert('HSV')).astype(int)
    H, S, V = h[..., 0], h[..., 1], h[..., 2]
    sat = (S > 55) & (V > 55)
    return {'G': sat & (H >= 60) & (H <= 115),
            'P': sat & (H >= 140) & (H <= 215),
            'R': sat & ((H <= 30) | (H >= 230))}


def seeds(a, dil=9):
    """번호의 **뜻있는 자리**(색 글자) 덩어리"""
    out = []
    for st, m in colmask(a).items():
        lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, dil))))
        for i, sl in enumerate(ndimage.find_objects(lab)):
            y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
            if not (18 <= y1 - y0 <= 36 and 8 <= x1 - x0 <= 90):
                continue
            if int((lab[sl] == i + 1).sum()) < 60:
                continue
            out.append(dict(st=st, y0=int(y0), y1=int(y1), x0=int(x0), x1=int(x1)))
    return out


def grow_left(a, r, gap=13):
    """회색 앞자리 0 을 먹으며 왼쪽으로 넓힌다. 빈 칸이 gap 만큼 이어지면 멈춘다."""
    ink = a[r['y0']:r['y1']].min(2) < 205
    x = r['x0']
    empty = 0
    while x > 0:
        if ink[:, x - 1].any():
            empty = 0
            x -= 1
        else:
            empty += 1
            if empty >= gap:
                break
            x -= 1
    return x + empty if empty else x


def first_glyph(a, r):
    """번호칸 맨 앞 글자의 **폭**.

    묶음 지시문은 「[0009~0011]」 처럼 **대괄호**로 시작한다. 「[」 는 폭 7px 쯤으로
    숫자 「0」(18px)보다 훨씬 좁다. 이 한 글자만 재면 지시문 머리인지 바로 알 수 있다
    — 사이의 「~」 가 회색이라 색으로는 못 가른다.
    """
    ink = a[r['y0']:r['y1'], r['bx0']:r['bx0'] + 40].min(2) < 205
    cols = ink.any(0)
    if not cols.any():
        return 99
    s0 = int(np.argmax(cols))
    w = 0
    for x in range(s0, len(cols)):
        if not cols[x]:
            break
        w += 1
    return w


def boxes(pi, a=None):
    """한 쪽의 번호칸 후보 — 줄로 묶고 왼쪽 끝까지 넓힌 상자"""
    if a is None:
        a = page(pi)
    H, W = a.shape[:2]
    rs = [r for r in seeds(a) if H * 0.05 < r['y0'] and r['y1'] < H * 0.96]
    keep = []
    for r in rs:
        r['col'] = int(r['x0'] > W // 2)
        r['pg'] = pi
        keep.append(r)
    # 줄로 묶는다 (y 가 가까운 것끼리), 줄 안에서는 왼쪽부터 이어 붙인다
    keep.sort(key=lambda q: (q['col'], q['y0'], q['x0']))
    lines = []
    for r in keep:
        if lines and r['col'] == lines[-1][0]['col'] and r['y0'] - lines[-1][0]['y0'] < 14:
            lines[-1].append(r)
        else:
            lines.append([r])
    out = []
    for L in lines:
        L.sort(key=lambda q: q['x0'])
        # 한 줄 안에서도 **멀리 떨어진 것은 딴 번호**다 — 단 안에 번호가 나란히 둘 놓이는 자리
        # (0626 왼쪽, 0627 오른쪽)에서 오른쪽 것을 통째로 잃는다.
        grp = [[L[0]]]
        for r in L[1:]:
            if r['x0'] - grp[-1][-1]['x1'] > 85:
                grp.append([r])
            else:
                grp[-1].append(r)
        for G in grp:
            p = dict(G[0])
            p['bx0'] = grow_left(a, G[0])
            p['ex1'] = G[-1]['x1']
            p['g1w'] = first_glyph(a, p)
            out.append(p)
    return a, out


def left_edges(rs, nmin=1, gap=14):
    """번호가 서는 **세로 기준선들**.

    한 단 안에서 번호가 다시 두 줄로 놓이는 자리가 있다(0626 과 0627 이 나란히).
    그래서 기준선을 단마다 하나로 못 박으면 오른쪽 것을 통째로 놓친다.
    왼쪽 끝을 모아 뭉치를 만들고, 그 뭉치를 모두 기준선으로 본다.
    (나란히 놓인 두 번호 중 오른쪽이 그 쪽에 하나뿐인 자리가 있어서 「두 개 이상」으로
     걸러도 놓친다. 가짜는 뒤의 글자 읽기·차례 맞추기에서 걸러진다.)
    """
    xs = sorted(r['bx0'] for r in rs)
    g = []
    for x in xs:
        if g and x - g[-1][-1] <= gap:
            g[-1].append(x)
        else:
            g.append([x])
    return [int(np.median(q)) for q in g if len(q) >= nmin]


def labels(pi, a=None, tol=26, wmax=115):
    """번호칸만 — 왼쪽 끝이 단의 기준선과 맞는 줄. 「[」로 시작하면 묶음 지시문."""
    a, rs = boxes(pi, a)
    es = left_edges(rs)
    out = []
    for r in rs:
        if not any(abs(r['bx0'] - e) <= tol for e in es):
            continue
        # 묶음 지시문 「[0009~0011]」 은 대괄호로 시작한다. 「[」 는 폭 3~6px,
        # 숫자 「1」 은 9~11px 로 또렷이 갈린다 — 재어 보고 고른 금이다.
        # (폭이 넓은지로만 가르면 「1121 대표문제」처럼 꼬리표가 붙은 번호를 지시문으로 버린다.)
        out.append(dict(r, hdr=r['g1w'] <= 7, w=r['ex1'] - r['bx0']))
    out.sort(key=lambda r: (r['col'], r['y0'], r['bx0']))
    return a, out
