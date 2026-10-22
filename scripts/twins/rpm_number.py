"""RPM 문항 그림에서 교재 원본 번호만 지운다 (2026-10-22).

왜
  학습지는 1, 2, 3… 으로 다시 번호를 매겨 인쇄하는데 그림 안에 교재 번호가 같이
  들어가 있어 학생이 헷갈린다. 쎈은 지웠는데 RPM 중등 4,470문항은 안 지워져 있었다.
  (공통수학1 RPM 1,184문항은 이미 깨끗하다.)

번호가 어디에 있나 — 두 가지
  · 혼자 한 줄 :  「0081 (중) 서술형」 밑에 발문
  · 본문 안    :  「[0147~0150] 오른쪽 그림과 같은 …」 다음 줄에 「0149  면 ABFE와 수직인 면」
  뒤엣것은 줄을 통째로 자르면 문제가 날아간다 → **번호 글자만** 흰색으로 덮는다.

조심할 것
  1) 앞의 0 은 흐린 색으로 찍힌다. 0081 은 「81」만 또렷해 글자가 둘로 잡힌다.
  2) 묶음 지시문 「[0147~0150]」 의 숫자도 색 글자다. 그걸 지우면 문제 범위가 사라진다.
     → 그 줄은 맨 왼쪽이 「[」(좁은 한 글자)이므로 줄째로 건너뛴다.
  3) 마지막 안전장치 — **아는 번호와 읽은 값이 같을 때만** 지운다. 다르면 손대지 않고 알린다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

GW, GH = 14, 22


def colored(a):
    x = a.astype(int)
    return ((x.max(2) - x.min(2)) >= 42) & (x.min(2) < 215)


def glyph_cols(sub):
    g, k = ndimage.label(sub)
    cols = []
    for j, s2 in enumerate(ndimage.find_objects(g)):
        if (g[s2] == j + 1).sum() < 8:
            continue
        x0, x1 = s2[1].start, s2[1].stop
        if cols and x0 < cols[-1][1] - 1:
            cols[-1][1] = max(cols[-1][1], x1)
        else:
            cols.append([x0, x1])
    return cols


def runs_of(a, dil=9):
    m = colored(a)
    lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, dil))))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if (lab[sl] == i + 1).sum() < 40:
            continue
        out.append(dict(y0=sl[0].start, y1=sl[0].stop, x0=sl[1].start, x1=sl[1].stop,
                        cols=glyph_cols(m[sl])))
    return m, out


def lines_of(runs):
    """y 가 겹치는 덩어리끼리 한 줄로 묶는다"""
    out = []
    for r in sorted(runs, key=lambda r: r['y0']):
        put = None
        for L in out:
            if min(L[0]['y1'], r['y1']) - max(L[0]['y0'], r['y0']) > 6:
                put = L
                break
        (put if put is not None else out.append([]) or out[-1]).append(r)
    return out


def number_candidates(a, dil=9, want=None):
    """번호일 수 있는 덩어리들 — **줄마다 맨 왼쪽 것 하나씩만**.

    번호는 늘 줄의 맨 앞에 선다. 2·3번째 덩어리까지 보면 묶음 지시문
    「[0147~0150]」 속 숫자가 후보로 들어오는데, 문항이 그 묶음의 첫 번째면
    지시문의 번호와 제 번호가 같아서 **지시문 쪽을 지워 버린다**
    (2026-10-22에 0001·0111 에서 실제로 그랬다).

    지시문 줄은 맨 왼쪽이 「[」(좁은 한 글자)이고 그 옆에 숫자 덩어리가 온다 →
    줄째로 건너뛴다. 다만 「0001」처럼 보이는 글자가 「1」 하나뿐인 번호도
    좁은 한 글자라서, **옆에 숫자 덩어리가 있을 때만** 지시문으로 본다.
    """
    m, runs = runs_of(a, dil)
    out = []
    for L in lines_of(runs):
        L.sort(key=lambda r: r['x0'])
        # 번호 글자 사이가 벌어져 덩어리가 쪼개지는 쪽이 있다 (0413 → 「4」+「13」).
        # 같은 줄에서 **숫자처럼 생긴 이웃**만 이어 붙인다 (난이도 딱지는 글자 폭이 넓어 안 붙는다).
        merged = [dict(L[0])]
        for q in L[1:]:
            p0 = merged[-1]
            gap = q['x0'] - p0['x1']
            qw = (q['x1'] - q['x0']) / max(1, len(q['cols']))
            if (gap <= 18 and len(p0['cols']) + len(q['cols']) <= 4
                    and abs((q['y1'] - q['y0']) - (p0['y1'] - p0['y0'])) <= 5
                    and qw <= 24):
                p0['x1'] = q['x1']
                p0['y0'] = min(p0['y0'], q['y0'])
                p0['y1'] = max(p0['y1'], q['y1'])
                p0['cols'] = p0['cols'] + [[c[0] + (q['x0'] - merged[-1]['x0']), c[1] + (q['x0'] - merged[-1]['x0'])]
                                           for c in q['cols']]
            else:
                merged.append(dict(q))
        L = merged
        first = L[0]
        w = first['x1'] - first['x0']
        h = first['y1'] - first['y0']
        if len(first['cols']) == 1 and w <= 20:
            near = [q for q in L[1:] if q['x0'] - first['x1'] <= 34 and len(q['cols']) >= 3]
            if near:
                continue            # 「[0147~0150]」 줄
        if not (16 <= h <= 48 and 1 <= len(first['cols']) <= 4):
            continue
        out.append(first)
    if want:
        out.sort(key=lambda r: 0 if len(r['cols']) == len(want) else 1)
    return m, out


def read_run(M, m, r):
    s = ''
    conf = 1.0
    for cx0, cx1 in r['cols']:
        g = m[r['y0']:r['y1'], r['x0'] + cx0:r['x0'] + cx1]
        ys = np.where(g.any(1))[0]
        if not len(ys):
            return '', 0
        g = g[ys[0]:ys[-1] + 1]
        v = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((GW, GH), Image.BILINEAR), float).ravel()
        v -= v.mean()
        nn = np.linalg.norm(v)
        if nn:
            v /= nn
        sc = sorted(((float(v @ t), ch) for ch, t in M.items()), reverse=True)
        s += sc[0][1]
        conf = min(conf, sc[0][0] - sc[1][0])
    return s, conf


def erase(a, r, missing=0, pad=3):
    """번호를 덮는다. 앞의 흐린 0 까지 덮으려고 글자 너비만큼 왼쪽으로 더 연다."""
    gw = max(8, (r['x1'] - r['x0']) // max(1, len(r['cols'])))
    x0 = max(0, r['x0'] - missing * gw - 10)
    out = a.copy()
    out[max(0, r['y0'] - pad):r['y1'] + pad, x0:r['x1'] + pad] = 255
    return out
