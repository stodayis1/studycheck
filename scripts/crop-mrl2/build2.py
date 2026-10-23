# -*- coding: utf-8 -*-
"""문항 1,272개의 최종 꼬리표를 만든다 → plan.json"""
import io
import json
import re
import numpy as np
import mnum
from plan import printed, sections, kind_of, spread

DIFF = [(0, 100, '하'), (125, 175, '중'), (185, 256, '상')]


def difficulty(bs):
    for b in bs:
        if not (20 <= b['w'] <= 46):
            continue
        for lo, hi, d in DIFF:
            if lo <= b['h'] <= hi:
                return d
    return None


def essay(pdf='sol.pdf'):
    """해설에 「채점 기준」이 붙은 문항 = 서술형"""
    import pymupdf
    d = pymupdf.open(pdf)
    out = set()
    for pi in range(len(d)):
        t = d[pi].get_text()
        for m in re.finditer(r'채점 기준', t):
            # 바로 앞에 나오는 네 자리 번호
            pre = t[:m.start()]
            ns = re.findall(r'(?<!\d)(\d{4})(?!\d)', pre)
            if ns:
                n = int(ns[-1])
                if 1 <= n <= 1272:
                    out.add(n)
    return out


def main():
    rows = json.load(io.open('cand.json', encoding='utf8'))
    asg = {int(k): v for k, v in json.load(io.open('assign.json')).items()}
    bd = json.load(io.open('badge.json', encoding='utf8'))
    tm = json.load(io.open('typemap2.json', encoding='utf8'))
    std = {t['code']: t for t in json.load(io.open('std.json', encoding='utf8'))}
    rt = {int(k): tuple(v) for k, v in json.load(io.open('rep_type.json')).items()}
    ans = json.load(io.open('ans/ans.json', encoding='utf8'))
    n2 = {v: k for k, v in asg.items()}
    secs = sections()
    es = essay()
    bych = {}
    for t in tm:
        bych.setdefault(t['ch'], {})[t['no']] = t

    # 1) 구간·중단원
    info = {}
    for n in range(1, 1273):
        r = rows[n2[n]]
        s = kind_of(secs, printed(r['pg']))
        info[n] = dict(n=n, pg=r['pg'], pp=printed(r['pg']), ch=s['ch'], kind=s['kind'])

    # 2) 유형 완성 — 대표 문제가 유형의 시작
    for ch in range(1, 11):
        ns = [n for n in range(1, 1273) if info[n]['ch'] == ch and info[n]['kind'] == '유형 완성']
        cur = None
        for n in ns:
            if n in rt and rt[n][0] == ch:
                cur = rt[n][1]
            if cur:
                info[n]['no'] = cur
                info[n]['how'] = '대표문제'
        left = [n for n in ns if 'no' not in info[n]]
        if left:          # 첫 대표 문제 앞의 몇 개
            for n in left:
                info[n]['no'] = 1
                info[n]['how'] = '자리'

    # 3) 나머지 구간 — 그 중단원의 유형을 차례대로 고르게
    for ch in range(1, 11):
        nt = len(bych[ch])
        for kind in ('개념 확인', '유형 점검', '실력 향상'):
            ns = [n for n in range(1, 1273)
                  if info[n]['ch'] == ch and info[n]['kind'] == kind]
            sp = spread(ns, nt)
            for n, v in sp.items():
                info[n]['no'] = v
                info[n]['how'] = '자리'

    # 4) 유형 점검 — 책이 적어 준 「유형 08」 꼬리표가 가장 정확하다.
    #    읽힌 것은 그대로 쓰고, 못 읽은 것은 **앞뒤 꼬리표 사이를 차례대로** 메운다
    #    (유형 점검은 유형 차례대로 나온다).
    import os
    tagn = {}
    if os.path.exists('tagno.json'):
        tagn = {int(k): v for k, v in json.load(io.open('tagno.json', encoding='utf8')).items()}
    for n, v in tagn.items():
        if v and v in bych[info[n]['ch']]:
            info[n]['no'] = v
            info[n]['how'] = '꼬리표'
    for ch in range(1, 11):
        ns = [n for n in range(1, 1273)
              if info[n]['ch'] == ch and info[n]['kind'] == '유형 점검']
        an = [i for i, n in enumerate(ns) if info[n]['how'] == '꼬리표']
        if not an:
            continue
        for i, n in enumerate(ns):
            if info[n]['how'] == '꼬리표':
                continue
            lo = max([j for j in an if j < i], default=None)
            hi = min([j for j in an if j > i], default=None)
            a0 = info[ns[lo]]['no'] if lo is not None else 1
            a1 = info[ns[hi]]['no'] if hi is not None else len(bych[ch])
            lo0 = lo if lo is not None else -1
            hi0 = hi if hi is not None else len(ns)
            # 유형 점검 끝에 **서술형이 붙어 유형 번호가 다시 1부터** 시작한다.
            # 그 턱 앞에서는 뒤쪽 못을 믿지 말고 **한 칸씩 올려** 간다.
            if a1 < a0:
                v = a0 + (i - lo0)
            else:
                v = a0 + int(round((a1 - a0) * (i - lo0) / float(max(1, hi0 - lo0))))
            info[n]['no'] = min(len(bych[ch]), max(1, v))
            info[n]['how'] = '꼬리표사이'


    # 5) 유형 코드·난이도·서술형·정답
    out = []
    for n in range(1, 1273):
        i = info[n]
        t = bych[i['ch']][i['no']]
        st = std[t['code']]
        a = ans.get(str(n), {})
        out.append(dict(n=n, pg=i['pg'], pp=i['pp'], ch=i['ch'], kind=i['kind'],
                        tno=i['no'], how=i['how'], code=t['code'],
                        sub=st['sub_chapter_no'], subt=st['sub_chapter_title'],
                        diff=difficulty(bd.get(str(n), [])),
                        rep=n in rt, essay=n in es,
                        atext=a.get('text')))
    json.dump(out, io.open('plan.json', 'w', encoding='utf8'), ensure_ascii=False)
    import collections
    print('문항', len(out))
    print('유형 정한 방법', collections.Counter(o['how'] for o in out))
    print('난이도', collections.Counter(o['diff'] for o in out))
    print('서술형', sum(1 for o in out if o['essay']), '· 대표문제', sum(1 for o in out if o['rep']))
    print('소단원별', dict(sorted(collections.Counter(o['sub'] for o in out).items())))


if __name__ == '__main__':
    main()
