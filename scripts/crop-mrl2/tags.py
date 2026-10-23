# -*- coding: utf-8 -*-
"""유형 점검 문항의 「유형 08」 꼬리표를 읽어 둔다 → tagno.json"""
import io
import json
import numpy as np
import mnum
from badge import badges
from selfread import train
from tag2 import read


def tagbox(a, r):
    for minw, hole, th in ((20, 7, 0.25), (8, 7, 0.25), (8, 7, 0.30)):
        bs = [b for b in badges(a, r, minw=minw, hole=hole, th=th) if 94 <= b['h'] <= 136]
        if not bs:
            continue
        bs.sort(key=lambda b: b['x'])
        g = [[bs[0]['x'], bs[0]['x'] + bs[0]['w']]]
        for b in bs[1:]:
            if b['x'] - g[-1][1] <= 12:
                g[-1][1] = b['x'] + b['w']
            else:
                g.append([b['x'], b['x'] + b['w']])
        w = max(g, key=lambda q: q[1] - q[0])
        if 18 <= w[1] - w[0] <= 60:
            return w
    return None


def main():
    rows = json.load(io.open('cand.json', encoding='utf8'))
    own = json.load(io.open('own.json'))
    X = np.load('X.npy')
    asg = {int(k): v for k, v in json.load(io.open('assign.json')).items()}
    S = json.load(io.open('reads2.json'))
    plan = {o['n']: o for o in json.load(io.open('plan.json', encoding='utf8'))}
    NT = {1: 13, 2: 17, 3: 21, 4: 13, 5: 14, 6: 17, 7: 21, 8: 22, 9: 20, 10: 15}
    ex, ey = train(X, own, rows, asg, strict=True, S=S)
    n2 = {v: k for k, v in asg.items()}
    tag = {}
    for n in range(1, 1273):
        if plan[n]['kind'] != '유형 점검':
            continue
        r = rows[n2[n]]
        a = mnum.page(r['pg'])
        w = tagbox(a, r)
        if not w:
            continue
        v = read(a, w[0] - 3, w[1] + 3, max(0, r['y0'] - 10), r['y1'] + 10, ex, ey)
        if v and 1 <= v <= NT[plan[n]['ch']]:
            tag[n] = v
    json.dump(tag, io.open('tagno.json', 'w'))
    print('꼬리표 읽음 %d / 유형점검 %d'
          % (len(tag), sum(1 for o in plan.values() if o['kind'] == '유형 점검')))


if __name__ == '__main__':
    main()
