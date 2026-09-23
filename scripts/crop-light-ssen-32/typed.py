# 유형 붙이기 (중3-2)
#  · A단계 → 직전 개념 머리말
#  · B단계·학교시험 → 소단원이 바뀌면 0으로 되돌리고, '대표문제' 배지를 셀 때마다 유형 +1
#    (유형 머리말이 60%밖에 안 잡혀서 머리말 대신 대표문제 개수로 경계를 잡는다)
import json, os, collections
from typemap import TM, CM, CSUB
from pillmap import PM

S = os.path.dirname(os.path.abspath(__file__))
P = lambda f: os.path.join(S, f)
qs = json.load(open(P('qnums_ok.json'), encoding='utf8'))
cn = json.load(open(P('concepts.json'), encoding='utf8'))
rp = json.load(open(P('reps.json'), encoding='utf8'))
pl = json.load(open(P('pills_body.json'), encoding='utf8'))

ev = []
for i, d in enumerate(cn):
    if CM.get(i): ev.append((d['pg'], d['half'], d['y0'], 0, 'C', i))
for i, d in enumerate(pl):
    if PM.get(i): ev.append((d['pg'], d['half'], d['y0'], 1, 'P', PM[i]))
for d in rp:
    ev.append((d['pg'], d['half'], d['y0'], 2, 'R', None))
for q in qs:
    ev.append((q['pg'], q['half'], q['y0'], 3, 'Q', q))
ev.sort(key=lambda e: (e[0], e[1], e[2], e[3]))

cur_sub = None; cur_con = None; k = 0; miss = 0; skip_rep = False
for pg, h, y, _, kind, v in ev:
    if kind == 'C':
        sub = CSUB[v]
        if sub != cur_sub: cur_sub = sub; k = 0
        cur_con = CM[v]
    elif kind == 'P':          # 유형 머리말 — 어긋난 셈을 바로잡는 기준점
        cur_sub, k = v
        skip_rep = True        # 머리말 바로 아래 대표문제는 이미 센 것이다
    elif kind == 'R':
        if skip_rep: skip_rep = False
        else: k += 1
    else:
        if v['sec'] == 'A' and cur_con:
            v['tcode'] = cur_con
        elif cur_sub and k:
            t = TM.get(cur_sub, {}).get(min(k, max(TM.get(cur_sub, {1: 1}))))
            if t: v['tcode'] = t
            else: miss += 1
        elif cur_con:
            v['tcode'] = cur_con
        else:
            miss += 1

print('유형 못 붙인 문항', miss)
print('유형 수', len({q['tcode'] for q in qs if 'tcode' in q}))
print(collections.Counter(q['sec'] for q in qs if 'tcode' in q))
json.dump(qs, open(P('qnums_typed.json'), 'w'), ensure_ascii=False)
