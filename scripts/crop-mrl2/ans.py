# -*- coding: utf-8 -*-
"""해설 PDF 에서 문항별 **정답**을 뽑는다.

해설은 글자층이 있어서 「0001 답 4」 처럼 번호 바로 뒤에 「답」 과 정답이 온다.
다만 출판사 수식 기호(`j2`=√2, `@`=제곱, `a|b`=분수)가 섞여 있어 글자 그대로는 못 쓴다.
그래서 **정답이 적힌 줄을 그림으로 오려** 두고, 동그라미 번호·짧은 정수만 글자로도 적어 둔다.
"""
import io
import json
import os
import re
import numpy as np
import pymupdf
from PIL import Image

NUMF = 'SDHoyoyo2-dBd'
ANSF = 'YDVYGO145'
CIRCLE = '①②③④⑤'


def spans(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                out.append(dict(bb=s['bbox'], f=s['font'], sz=round(s['size'], 1), t=s['text']))
    W = page.rect.width
    out.sort(key=lambda q: (q['bb'][0] > W / 2, round(q['bb'][1] / 3), q['bb'][0]))
    return out, W


def numbers(sp):
    """번호 스팬 묶기.

    「0001」 이 「000」+「1」 처럼 둘로 쪼개져 오고, 그 사이에 탭 같은 빈 스팬이
    끼기도 한다. 그래서 차례로 이어 붙이지 말고 **같은 줄에서 가로로 맞닿은 것**끼리 묶는다.
    """
    cand = [(k, s) for k, s in enumerate(sp)
            if s['f'] == NUMF and abs(s['sz'] - 12.7) < 0.4
            and re.fullmatch(r'\d{1,4}\s*', s['t'])]
    cand.sort(key=lambda q: (round(q[1]['bb'][1] / 3), q[1]['bb'][0]))
    out = []
    grp = []
    for k, s in cand:
        if grp and abs(s['bb'][1] - grp[-1][1]['bb'][1]) < 3                 and s['bb'][0] - grp[-1][1]['bb'][2] < 4:
            grp.append((k, s))
        else:
            if grp:
                out.append(grp)
            grp = [(k, s)]
    if grp:
        out.append(grp)
    res = []
    for g in out:
        t = ''.join(s['t'].strip() for _, s in g)
        if len(t) != 4:
            continue
        bb = (g[0][1]['bb'][0], min(s['bb'][1] for _, s in g),
              g[-1][1]['bb'][2], max(s['bb'][3] for _, s in g))
        res.append((int(t), bb, max(k for k, _ in g)))
    return res


def grab(pdf='sol.pdf'):
    """번호마다 **그 줄에서 번호 오른쪽**에 있는 글자들 = 「답 …」"""
    d = pymupdf.open(pdf)
    got = {}
    for pi in range(len(d)):
        sp, W = spans(d[pi])
        for n, bb, i in numbers(sp):
            if n in got or not (1 <= n <= 1272):
                continue
            half = bb[0] > W / 2
            # 번호 **오른쪽, 같은 줄**의 글자를 x 차례로 줍는다.
            # ※ 스팬 차례(index)로 줍지 말 것 — 번호가 둘로 쪼개져 있어 차례가 뒤엉킨다.
            same = [q for q in sp
                    if (q['bb'][0] > W / 2) == half
                    and q['bb'][0] >= bb[2] - 1
                    and bb[1] - 6 <= (q['bb'][1] + q['bb'][3]) / 2.0 <= bb[3] + 6]
            same.sort(key=lambda z: z['bb'][0])
            line = []
            for q in same:
                if q['f'] == NUMF and abs(q['sz'] - 12.7) < 0.4:
                    break
                if line and q['bb'][0] - line[-1]['bb'][2] > 32:
                    break
                line.append(q)
            if not line:
                continue
            x0 = min(q['bb'][0] for q in line)
            x1 = max(q['bb'][2] for q in line)
            y0 = min(min(q['bb'][1] for q in line), bb[1])
            y1 = max(max(q['bb'][3] for q in line), bb[3])
            txt = ''.join(q['t'] for q in sorted(line, key=lambda z: z['bb'][0]))
            h = bb[3] - bb[1]
            got[n] = dict(pg=pi, x0=max(x0 - 1, bb[2] + 1), x1=x1 + 2,
                          y0=max(y0 - 1, bb[1] - h * 0.5), y1=min(y1 + 1, bb[3] + h * 0.5),
                          t=txt.strip(), st=stacked(line))
    # 글꼴이 다른 쪽이 더러 있어 번호 스팬으로 못 찾는다 → 글자로 찾아 자리를 얻는다
    rest = [n for n in range(1, 1273) if n not in got]
    for pi in range(len(d)):
        if not rest:
            break
        page = d[pi]
        txt = page.get_text()
        sp, W = spans(page)
        for n in list(rest):
            key = '%04d' % n
            if key not in txt:
                continue
            hits = page.search_for(key)
            if len(hits) != 1:
                continue
            r = hits[0]
            bb = (r.x0, r.y0, r.x1, r.y1)
            half = bb[0] > W / 2
            same = [q for q in sp
                    if (q['bb'][0] > W / 2) == half
                    and q['bb'][0] >= bb[2] - 1
                    and bb[1] - 6 <= (q['bb'][1] + q['bb'][3]) / 2.0 <= bb[3] + 6]
            same.sort(key=lambda z: z['bb'][0])
            line = []
            for q in same:
                if re.fullmatch(r'\d{4}\s*', q['t']) and q['sz'] > 11:
                    break
                if line and q['bb'][0] - line[-1]['bb'][2] > 32:
                    break
                line.append(q)
            if not line:
                continue
            got[n] = dict(pg=pi,
                          x0=max(min(q['bb'][0] for q in line) - 1, bb[2] + 1),
                          x1=max(q['bb'][2] for q in line) + 2,
                          y0=min(min(q['bb'][1] for q in line), bb[1]) - 1,
                          y1=max(max(q['bb'][3] for q in line), bb[3]) + 1,
                          t=''.join(q['t'] for q in line).strip(), st=stacked(line))
            rest.remove(n)
    return d, got


def cut_tail(a, gap=7):
    """정답 아래로 딸려 들어온 풀이 한 줄을 잘라 낸다 — 첫 **빈 줄**에서 끊는다"""
    m = (a.min(2) < 205).sum(1) > 1
    rs = np.nonzero(m)[0]
    if not len(rs):
        return a
    y = rs[0]
    run = 0
    for i in range(rs[0], len(m)):
        if m[i]:
            run = 0
            y = i
        else:
            run += 1
            if run >= gap:
                break
    return a[max(0, rs[0] - 3):min(a.shape[0], y + 4)]


def stacked(line):
    """분수처럼 **위아래로 포개진** 글자가 있는가.

    분수 2/3 은 「2」와 「3」이 같은 x 에 위아래로 놓인다. x 차례로 이으면 「23」이 돼
    정답을 통째로 틀리게 적는다. 포개져 있으면 글자로 적지 않고 그림만 쓴다.
    """
    for i, a in enumerate(line):
        for b in line[i + 1:]:
            ox = min(a['bb'][2], b['bb'][2]) - max(a['bb'][0], b['bb'][0])
            w = min(a['bb'][2] - a['bb'][0], b['bb'][2] - b['bb'][0])
            if w > 0 and ox > w * 0.4 and abs((a['bb'][1] + a['bb'][3]) / 2.0
                                              - (b['bb'][1] + b['bb'][3]) / 2.0) > 4:
                return True
    return False


def text_of(t):
    """글자로 적어도 안전한 정답만 (동그라미·정수)"""
    s = t.strip()
    if len(s) == 1 and s in CIRCLE:
        return s
    s = re.sub(r'^(답|1)\s*', '', s).strip()
    if len(s) == 1 and s in CIRCLE:
        return s
    if re.fullmatch(r'-?\d{1,4}', s):
        return s
    if re.fullmatch(r'[①②③④⑤]', s):
        return s
    return None


def save(outdir, dpi=200):
    d, got = grab()
    os.makedirs(outdir, exist_ok=True)
    meta = {}
    z = dpi / 72.0
    for n, g in sorted(got.items()):
        r = pymupdf.Rect(g['x0'], g['y0'], max(g['x1'], g['x0'] + 18), g['y1'])
        pm = d[g['pg']].get_pixmap(matrix=pymupdf.Matrix(z, z), clip=r)
        a = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[:, :, :3]
        p = os.path.join(outdir, '%04d.png' % n)
        Image.fromarray(cut_tail(a)).save(p)
        meta[n] = dict(text=None if g.get('st') else text_of(g['t']), raw=g['t'])
    json.dump(meta, io.open(os.path.join(outdir, 'ans.json'), 'w', encoding='utf8'),
              ensure_ascii=False)
    return meta


if __name__ == '__main__':
    import sys
    m = save(sys.argv[1] if len(sys.argv) > 1 else 'ans')
    print('정답 %d개 · 글자로도 적은 것 %d'
          % (len(m), sum(1 for v in m.values() if v['text'])))
    print('빠진 번호', [n for n in range(1, 1273) if n not in m][:20])
