# -*- coding: utf-8 -*-
"""빠른정답(글자층 있음)에서 **번호·정답·중단원**을 뽑는다.

한 쪽에 번호 단이 8개(왼 4 · 오른 4)다. 단을 안 나누고 y 로만 읽으면
단원 범위가 서로 겹쳐 버린다. 번호의 x 를 모아 단을 먼저 가른다.
"""
import io
import json
import re
import pymupdf

NUMF = 'DIN2014-Demi'
HEADF = 'GmarketSansMedium'


def spans(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                out.append(dict(f=s['font'], sz=round(s['size'], 1),
                                t=s['text'], bb=s['bbox']))
    return out


def columns(sp, gap=26):
    xs = sorted(round(s['bb'][0]) for s in sp
                if s['f'].startswith(NUMF) and re.fullmatch(r'\d{4}', s['t'].strip()))
    if not xs:
        return []
    g = [[xs[0]]]
    for x in xs[1:]:
        if x - g[-1][-1] <= gap:
            g[-1].append(x)
        else:
            g.append([x])
    return [min(q) for q in g]


def read(pdf='quick.pdf'):
    d = pymupdf.open(pdf)
    nums, heads = [], []
    cur = None          # 단원은 **쪽을 넘어 이어진다** — 쪽마다 비우면 절반이 빈다
    for pi in range(len(d)):
        sp = spans(d[pi])
        cols = columns(sp)
        if not cols:
            continue
        # 덩이 경계 — 단 사이 틈이 가장 큰 자리
        gaps = [(cols[i + 1] - cols[i], i) for i in range(len(cols) - 1)]
        split = cols[max(gaps)[1] + 1] - 10 if gaps else 1e9
        for s in sp:
            s['c'] = 0 if s['bb'][0] < split else 1
        sp.sort(key=lambda q: (q['c'], round(q['bb'][1] / 4), q['bb'][0]))
        for i, s in enumerate(sp):
            t = s['t'].strip()
            if s['f'] == HEADF and abs(s['sz'] - 12) < 0.6 and re.search(r'[가-힣]', t) and t != '회':
                cur = t
                heads.append((pi, s['c'], t))
                continue
            if s['f'].startswith(NUMF) and re.fullmatch(r'\d{4}', t):
                n = int(t)
                # 같은 줄에서 번호 오른쪽에 붙은 글자가 정답
                bb = s['bb']
                # 단 간격이 60px 쯤이라 42 까지 보면 **다음 단 번호의 정답**이 딸려 온다
                near = [q for q in sp
                        if q['bb'][0] >= bb[2] - 1 and q['bb'][0] < bb[2] + 31
                        and bb[1] - 9 <= (q['bb'][1] + q['bb'][3]) / 2 <= bb[3] + 9
                        and not (q['f'].startswith(NUMF) and re.fullmatch(r'\d{4}', q['t'].strip()))]
                near.sort(key=lambda q: (q['bb'][0], q['bb'][1]))
                nums.append(dict(n=n, ch=cur, a=''.join(q['t'] for q in near).strip(),
                                 pi=pi, c=s['c'], y=round(bb[1]), x=round(bb[0]),
                                 x1=round(bb[2]), y1=round(bb[3])))
    return nums, heads


if __name__ == '__main__':
    nums, heads = read()
    print('번호', len(nums), '· 단원 머리', len(heads))
    rng = {}
    for q in nums:
        if not q['ch']:
            continue
        r = rng.setdefault(q['ch'], [q['n'], q['n']])
        r[0] = min(r[0], q['n'])
        r[1] = max(r[1], q['n'])
    for k, v in sorted(rng.items(), key=lambda z: z[1][0]):
        print('  %-14s %4d ~ %4d  (%d)' % (k, v[0], v[1],
              sum(1 for q in nums if q['ch'] == k)))
    json.dump(nums, io.open('quick.json', 'w', encoding='utf8'), ensure_ascii=False)
