"""쎈 공통수학2 — 문항 그림 자르기

쓰는 법:  python crop.py out            (전부)
          python crop.py out 8 17 73    (그 쪽만, 확인용)
"""
import json
import io
import os
import sys
import numpy as np
from PIL import Image
import s2det
from furniture import furniture, columns, at_left_edge
from cut import (ink, inkrows, runs, trim_rows, cut_end, col_span, half_span,
                 ext_top, clean_above, white, fit, W_OUT)

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    return json.load(io.open(os.path.join(HERE, name), encoding='utf8'))


def numline_bottom(a, r, x0, x1):
    """번호가 있는 줄의 아래 끝 — 그 아래부터가 발문이다"""
    lo = max(0, r['y0'] - 6)
    hi = min(a.shape[0], r['y1'] + 40)
    m = inkrows(a[lo:hi, x0:x1])
    rr = runs(m, gap=3)
    for s, e in rr:
        if lo + e > r['y0'] + 4:
            return lo + e
    return r['y1']


def hide_number(img, r, x0):
    """발문과 같은 줄에 있는 번호를 흰색으로 덮는다 (A단계)"""
    img = img.copy()
    xa = max(0, r['x0'] - x0 - 3)
    xb = min(img.shape[1], r['x1'] - x0 + 6)
    h = min(img.shape[0], r['y1'] - r['y0'] + 10)
    img[:h, xa:xb] = 255
    return img


def run(outdir, only=None):
    seq = load('qnum.json')
    step = load('qstep.json')
    typ = load('qtype.json')
    heads = load('qhead.json')
    byp = {}
    for s in seq:
        byp.setdefault(s['pg'], []).append(s)
    os.makedirs(outdir, exist_ok=True)
    made, warn = {}, []
    for pg in sorted(byp):
        if only and pg not in only:
            continue
        labels = [s for s in byp[pg] if s.get('N')]
        if not labels:
            continue
        a = s2det.page('q.pdf', pg)
        H, W = a.shape[:2]
        cols = columns(byp[pg], W)
        fur = furniture(a)
        # 아래쪽 경계가 되는 것들 — 다음 묶음 지시문·소단원 배지·유형 배지에
        # 본문이 흘러 들어가면 안 된다
        stops = [r for r in fur
                 if r['what'] in ('bracket', 'sub', 'type', 'focus')]
        for r in labels:
            x0, x1 = col_span(r, labels, W)
            st = step[str(r['N'])]
            # 같은 단의 다음 문항
            later = [q for q in labels
                     if q['side'] == r['side'] and abs(q['x0'] - r['x0']) <= 40
                     and q['y0'] > r['y1'] + 5]
            nxt = min((q['y0'] for q in later), default=int(H * 0.945))
            # 다음 부속물(지시문·배지)도 경계다
            nxt = min([nxt] + [s2['y0'] - 6 for s2 in stops
                               if (0 if s2['x0'] < W // 2 else 1) == r['side']
                               and s2['x0'] < x1 and s2['y0'] > r['y1'] + 5])
            nb = numline_bottom(a, r, x0, x1)
            # 번호 글자가 그 줄의 아래끝보다 살짝 더 내려오는 쪽이 있다(0204).
            # 기준선을 번호 아래로 조금 내려 잡아야 번호가 「아래와 이어진 것」으로
            # 오해받지 않는다.
            base = max(nb, r['y1'] + 6)
            top = max(0, r['y0'] - 6) if st == 'A' else ext_top(a, r, x0, x1, base)
            end = cut_end(a, x0, x1, base, nxt)
            if end - top < 20:
                warn.append((r['N'], '너무 짧음', end - top))
                end = min(nxt - 4, top + 60)
            body = a[top:end, x0:x1]
            if st == 'A':
                body = hide_number(body, r, x0)
            elif top < base:
                body = clean_above(body, base - top)
            parts = []
            b = heads.get(str(r['N']))
            if b:
                # 지시문은 단의 왼쪽 모서리에서 시작한다. 가로로 둘인 줄의
                # 오른쪽 문항 x 에서 자르면 지시문 앞머리가 날아간다.
                hx0, hx1 = half_span(dict(x0=b['x0'], side=b['side']), W)
                ha = a if b['pg'] == pg else s2det.page('q.pdf', b['pg'])
                hb = ha[max(0, b['y0'] - 6):max(b['y1'] + 6, b['firsty'] - 6), hx0:hx1]
                hb = trim_rows(hb)
                if hb.shape[0] > 8:
                    parts += [hb, white(10, hb.shape[1])]
            parts.append(trim_rows(body))
            img = fit(parts)
            d = os.path.join(outdir, '%02d' % int(typ[str(r['N'])].split('-')[1]))
            os.makedirs(d, exist_ok=True)
            Image.fromarray(img).save(os.path.join(d, '%04d.png' % r['N']))
            made[r['N']] = img.shape
    print(f'자른 문항 {len(made)}개 · 경고 {len(warn)}')
    for w in warn[:20]:
        print('   ', w)
    return made


if __name__ == '__main__':
    out = sys.argv[1]
    only = set(int(x) for x in sys.argv[2:]) or None
    run(out, only)
