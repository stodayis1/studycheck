# -*- coding: utf-8 -*-
"""문항 1,895개에 **구간·유형·단원**을 붙인다 → plan.json

  · 구간은 **번호 빛깔**로 갈린다 — 청록 STEP1 유형 / 남색 STEP2 서술형 / 빨강 STEP3 최고난도
  · STEP1 은 바로 위 유형 띠가 곧 유형이다 (정확)
  · STEP2·STEP3 은 중단원 끝에 몰려 있고 유형 표시가 없어, 그 중단원의 유형을 자리 비례로 나눈다
  · 중단원은 빠른정답(글자층)이 알려 준다
"""
import io
import json


def step_of(h):
    if h < 0:
        return 'STEP1'
    if h < 10 or h > 240:
        return 'STEP3'
    if 150 <= h <= 200:
        return 'STEP2'
    return 'STEP1'


def main():
    rows = json.load(io.open('cand.json', encoding='utf8'))
    asg = {int(k): v for k, v in json.load(io.open('assign.json')).items()}
    bands = json.load(io.open('band2.json', encoding='utf8'))
    tm = json.load(io.open('typemap.json', encoding='utf8'))
    hue = {int(k): v for k, v in json.load(io.open('numhue.json')).items()}
    quick = {r['n']: r for r in json.load(io.open('quick.json', encoding='utf8'))}
    bym = {t['i']: t for t in tm}
    n2 = {v: k for k, v in asg.items()}

    def key(r):
        return (r['pg'], r['col'], r['y0'])

    # 띠 → (중단원, 유형) · 자리
    bk = []
    for i, b in enumerate(bands):
        if i in bym:
            bk.append((key(b), bym[i]))
    bk.sort()
    info = {}
    for n in range(1, 1896):
        r = rows[n2[n]]
        k = key(r)
        t = None
        for bkey, bt in bk:
            if bkey < k:
                t = bt
            else:
                break
        info[n] = dict(n=n, pg=r['pg'], col=r['col'],
                       step=step_of(hue.get(n, -1)),
                       chap=quick[n]['ch'], band=t)
    # 중단원 번호 (빠른정답 차례)
    order = []
    for n in range(1, 1896):
        c = info[n]['chap']
        if not order or order[-1] != c:
            order.append(c)
    chno = {c: i + 1 for i, c in enumerate(order)}
    for n in info:
        info[n]['ch'] = chno[info[n]['chap']]
    # STEP1 — 띠가 곧 유형. 띠의 중단원이 다르면 믿지 않는다
    for n in range(1, 1896):
        q = info[n]
        b = q['band']
        if q['step'] == 'STEP1' and b and b['ch'] == q['ch']:
            q['no'] = b['no']
            q['code'] = b['code']
            q['how'] = '유형띠'
    # 나머지 — 그 중단원의 유형을 자리 비례로
    bych = {}
    for t in tm:
        bych.setdefault(t['ch'], {})[t['no']] = t
    for ch in sorted(bych):
        rest = [n for n in range(1, 1896) if info[n]['ch'] == ch and 'no' not in info[n]]
        nt = len(bych[ch])
        for i, n in enumerate(rest):
            k = min(nt, 1 + i * nt // max(1, len(rest)))
            info[n]['no'] = k
            info[n]['code'] = bych[ch][k]['code']
            info[n]['how'] = '자리'
    json.dump([info[n] for n in range(1, 1896)],
              io.open('plan.json', 'w', encoding='utf8'), ensure_ascii=False)
    import collections
    print('문항', len(info))
    print('구간', collections.Counter(q['step'] for q in info.values()))
    print('유형 정한 방법', collections.Counter(q['how'] for q in info.values()))
    print('중단원', collections.Counter(q['ch'] for q in info.values()))


if __name__ == '__main__':
    main()
