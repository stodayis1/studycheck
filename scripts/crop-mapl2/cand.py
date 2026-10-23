# -*- coding: utf-8 -*-
"""번호칸 후보 모으기 — 색으로 찾은 것과 생김새로 찾은 것을 **합친다**.

색(mdet2)은 정확하지만 **검정 번호**(유형점검 0086 …)를 통째로 놓친다.
생김새(mnum)는 검정까지 잡지만 본문 줄을 더러 끌어온다.
둘을 합쳐 놓고, 뒤에서 숫자 읽기로 가짜를 쳐낸다.
"""
import numpy as np
import mdet2
import mnum


def page(pi):
    return mnum.page(pi)


def cands(pi, a=None):
    if a is None:
        a = page(pi)
    out = []
    try:
        _, A = mdet2.labels(pi, a=a)
    except Exception:
        A = []
    for r in A:
        if r['hdr']:
            continue
        out.append(dict(pg=pi, col=r['col'], y0=r['y0'], y1=r['y1'],
                        x0=r['bx0'], src='c'))
    try:
        _, B = mnum.numbers(pi, a=a)
    except Exception:
        B = []
    for r in B:
        out.append(dict(pg=pi, col=r['col'], y0=r['y0'], y1=r['y1'],
                        x0=r['x0'], src='s'))
    out.sort(key=lambda r: (r['col'], r['y0'], r['x0']))
    # 같은 자리를 두 검출기가 함께 잡은 것만 합친다.
    # ※ 세로 자리만 보면 안 된다 — 단 안에서 번호가 나란히 둘 놓이는 자리가 있어서
    #    0626 과 0627 이 같은 줄이라고 한쪽이 지워진다. 가로 자리까지 함께 본다.
    ded = []
    for r in out:
        hit = None
        for q in ded:
            if (q['col'] == r['col'] and abs(q['y0'] - r['y0']) < 16
                    and abs(q['x0'] - r['x0']) < 40):
                hit = q
                break
        if hit is not None:
            if hit['src'] == 's' and r['src'] == 'c':
                hit.update(r)
            continue
        ded.append(r)
    return a, ded


def cut4(prof, lo, hi, wmin=8, wmax=34):
    """번호칸을 **반드시 네 칸**으로 쪼갠다 — 잉크가 가장 옅은 세 자리를 고른다.

    폭으로 어림잡아 쪼개면 「0111」처럼 1이 섞인 번호가 세 칸으로 세어진다.
    네 자리인 것은 확실하므로, 칸 너비를 9~34px 로 묶어 두고
    자르는 자리의 잉크 합이 가장 작은 조합을 고른다.
    """
    W = hi - lo
    if W < wmin * 4:
        return None
    best = None
    for c1 in range(lo + wmin, hi - wmin * 3 + 1):
        if c1 - lo > wmax:
            break
        for c2 in range(c1 + wmin, hi - wmin * 2 + 1):
            if c2 - c1 > wmax:
                break
            for c3 in range(c2 + wmin, hi - wmin + 1):
                if c3 - c2 > wmax or hi - c3 > wmax:
                    if c3 - c2 > wmax:
                        break
                    continue
                v = prof[c1] + prof[c2] + prof[c3]
                if best is None or v < best[0]:
                    best = (v, c1, c2, c3)
    return None if best is None else best[1:]


def glyphs(a, r, span=112, gap=3):
    """번호칸을 네 글자 칸으로 쪼갠다"""
    y0, y1 = r['y0'], r['y1']
    x0 = r['x0']
    sub = a[y0:y1, x0:x0 + span]
    ink = sub.min(2) < 205
    cols = ink.any(0)
    rr = [(s, e) for s, e in mnum.runs(cols, gap=gap) if e - s >= 4]
    if not rr:
        return []
    keep = [rr[0]]
    for s, e in rr[1:]:
        # 번호 뒤에 붙은 난이도 동그라미·「유형 11」 꼬리표까지 끌어오면 폭이 넘친다
        if s - keep[-1][1] > 12 or e - keep[0][0] > 106:
            break
        keep.append((s, e))
    lo, hi = keep[0][0], keep[-1][1]
    # 「1111」 은 1이 넷이라 폭이 48px 밖에 안 된다 — 아래 금을 50 으로 두면 통째로 놓친다
    if not (40 <= hi - lo <= 106):
        return []
    prof = ink.sum(0).astype(int)
    cc = cut4(prof, lo, hi)
    if cc is None:
        return []
    out = []
    for a0, a1 in zip((lo,) + cc, cc + (hi,)):
        g = ink[:, a0:a1]
        rs = np.nonzero(g.any(1))[0]
        cs = np.nonzero(g.any(0))[0]
        if not len(rs) or not len(cs):
            return []
        out.append(dict(x0=x0 + a0 + int(cs[0]), x1=x0 + a0 + int(cs[-1]) + 1,
                        y0=y0 + int(rs[0]), y1=y0 + int(rs[-1]) + 1))
    return out

