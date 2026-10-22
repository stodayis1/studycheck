"""쎈 공통수학2(스캔본)에서 문항 번호 라벨을 찾는다.

번호는 단 왼쪽 모서리에 있는 **색 상자 안의 흰 네 자리 숫자**다.
  · 보통 문항 : 초록(B단계) / 빨강(A단계) / 파랑(C단계) 상자
  · 대표 문제 : 좀 더 긴 갈색 상자 (뒤에 「대표 문제」 글씨가 붙는다)
난이도 딱지(•중•), 유형 배지(유형 01), 집중공략 같은 것도 같은 색이라
**단의 왼쪽 모서리에 붙어 있는지**로 가린다.
"""
import numpy as np, pymupdf
from PIL import Image
from scipy import ndimage

DPI = 200
_d = {}

def doc(name):
    if name not in _d: _d[name] = pymupdf.open(name)
    return _d[name]

def page(name, i, dpi=DPI):
    pm = doc(name)[i].get_pixmap(dpi=dpi)
    return np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, 3).copy()

def colmask(a):
    h = np.array(Image.fromarray(a).convert('HSV')).astype(int)
    H, S, V = h[..., 0], h[..., 1], h[..., 2]
    sat = (S > 70) & (V > 70)
    return {'A': sat & ((H <= 24) | (H >= 235)),
            'B': sat & (H >= 55) & (H <= 125),
            'C': sat & (H >= 126) & (H <= 185)}

def cands(a, dil=7):
    """크기만 보고 후보를 모은다 (어느 단인지는 아직 모른다)."""
    out = []
    for st, m in colmask(a).items():
        lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, dil))))
        for i, s in enumerate(ndimage.find_objects(lab)):
            y0, y1, x0, x1 = s[0].start, s[0].stop, s[1].start, s[1].stop
            hh, ww = y1 - y0, x1 - x0
            # 세 가지가 단 왼쪽 모서리에 같은 색으로 선다 — 크기로 가른다
            #   번호 h27 w68 · 대표문제 상자 h40 w187 · 유형 배지 h50 w91
            # C단계는 번호가 상자 없이 맨 글자라 키가 작다 (h 19~22)
            kind = ('num' if 18 <= hh <= 33 and 55 <= ww <= 85 else
                    'rep' if 35 <= hh <= 45 and 160 <= ww <= 210 else
                    'type' if 45 <= hh <= 57 and 78 <= ww <= 115 else None)
            if kind:
                out.append(dict(st=st, kind=kind, y0=int(y0), y1=int(y1),
                                x0=int(x0), x1=int(x1)))
    return out


def labels(name, pi, dpi=DPI, dil=7):
    """그 쪽의 번호·대표문제·유형 배지를 찾는다.

    단 모서리는 **후보들의 가장 왼쪽 x**로 잡는다. 번호가 그 단에서 제일 왼쪽에
    서기 때문이다. 잉크로 재거나 「같은 x 가 둘 이상」을 요구하면, C단계처럼
    한 쪽에 번호가 하나뿐인 단에서 통째로 놓친다.
    """
    a = page(name, pi, dpi)
    H, W = a.shape[:2]
    c = [r for r in cands(a, dil) if H * 0.055 < r['y0'] and r['y1'] < H * 0.96]
    if not c:
        return [], []
    mid = W // 2
    # A단계 쪽은 한 단 안에 문제가 **두 줄로** 들어간다 (0627 옆에 0628).
    # 가장 왼쪽 x 만 받으면 그 절반을 통째로 버린다.
    # 그래서 반쪽마다 x 를 뭉쳐 보고, 둘 이상 모인 자리는 모두 번호 줄로 인정한다.
    ed = []
    for lo, hi in ((0, mid), (mid, W)):
        xs = sorted(r['x0'] for r in c if lo <= r['x0'] < hi)
        if not xs:
            continue
        groups = []
        for x in xs:
            if groups and x - groups[-1][-1] <= 20:
                groups[-1].append(x)
            else:
                groups.append([x])
        for g in groups:
            if len(g) >= 2 or g[0] == xs[0]:
                ed.append((lo, int(np.median(g))))
    out = []
    for r in c:
        side = 0 if r['x0'] < mid else 1
        if not any(lo == (0 if side == 0 else mid) and abs(r['x0'] - e) <= 14 for lo, e in ed):
            continue
        r['side'] = side
        r['pg'] = pi
        out.append(r)
    out.sort(key=lambda r: (r['side'], r['y0']))
    return out, ed


def lum(a):
    a = a.astype(int)
    return (a[..., 0] * 299 + a[..., 1] * 587 + a[..., 2] * 114) // 1000


def glyphmask(a, r):
    """번호 라벨 안에서 숫자 획만 남긴 흑백 틀을 돌려준다.

    「흰 바탕에 색 글자」(대부분)와 「색 상자 위 흰 글자」(대표 문제)가 섞여 있다.
    테두리 색으로 가르려 했더니 갈색 상자가 애매해서 빗나갔다 →
    **두 가지로 다 만들어 보고 글자처럼 생긴 쪽**을 고른다.
    글자처럼 생겼다 = 켜진 비율이 15~55% 이고 가로로 네 덩어리로 끊긴다.
    """
    x1 = r['x1']
    if r.get('kind') == 'rep':
        x1 = min(x1, r['x0'] + 72)        # 「0016 대표 문제」에서 번호만
    sub = a[r['y0']:r['y1'], max(0, r['x0'] - 1):x1 + 1]
    if sub.size == 0:
        return None
    h = np.array(Image.fromarray(sub).convert('HSV')).astype(int)
    L = lum(sub)
    dark = L < 205
    light = (L > 185) & (h[..., 1] < 80)
    light[:3] = light[-3:] = False
    light[:, :3] = light[:, -3:] = False

    def score(m):
        f = float(m.mean())
        if not (0.12 <= f <= 0.58):
            return -1
        lab, n = ndimage.label(m)
        xs = sorted((sl[1].start, sl[1].stop) for sl in ndimage.find_objects(lab)
                    if (lab[sl] == 0).size and (sl[1].stop - sl[1].start) > 3)
        merged = []
        for x0, x2 in xs:
            if merged and x0 < merged[-1][1] - 1:
                merged[-1][1] = max(merged[-1][1], x2)
            else:
                merged.append([x0, x2])
        return 1.0 - abs(len(merged) - 4) * 0.3 - abs(f - 0.33)

    return dark if score(dark) >= score(light) else light


def quicklabels(pi, name='quick2.pdf'):
    """빠른정답 쪽에서 번호 라벨을 읽는 차례대로 돌려준다 (왼 단 전부 → 오른 단 전부)."""
    a = page(name, pi)
    H, W = a.shape[:2]
    out = []
    # 빠른정답의 번호는 본문보다 가늘고 작다 (h 20 · w 49) — 색 기준도 조금 낮춘다
    hv = np.array(Image.fromarray(a).convert('HSV')).astype(int)
    HH, SS, VV = hv[..., 0], hv[..., 1], hv[..., 2]
    sat = (SS > 45) & (VV > 45)
    qm = {'A': sat & ((HH <= 24) | (HH >= 235)), 'B': sat & (HH >= 55) & (HH <= 125),
          'C': sat & (HH >= 126) & (HH <= 185)}
    for st, m in qm.items():
        lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, 7))))
        for i, s in enumerate(ndimage.find_objects(lab)):
            y0, y1, x0, x1 = s[0].start, s[0].stop, s[1].start, s[1].stop
            if 16 <= y1 - y0 <= 26 and 42 <= x1 - x0 <= 62 and y0 > H * 0.08:
                out.append(dict(pg=pi, st=st, y0=int(y0), y1=int(y1), x0=int(x0), x1=int(x1)))
    mid = W // 2
    rows = []
    for half in (0, 1):
        side = [r for r in out if (r['x0'] < mid) == (half == 0)]
        side.sort(key=lambda r: r['y0'])
        cur = []
        for r in side:
            if cur and abs(r['y0'] - cur[0]['y0']) < 14:
                cur.append(r)
            else:
                rows += sorted(cur, key=lambda q: q['x0'])
                cur = [r]
        rows += sorted(cur, key=lambda q: q['x0'])
    return a, rows
