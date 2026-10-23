# -*- coding: utf-8 -*-
"""문항 그림을 자르고 업로드 자료(problems_data.json)를 만든다.

폴더 짜임새는 기존 교재와 같게 — `<out>/공통수학2-1/유형만렙/<소단원>/0001.png`,
정답은 `0001).png`. 이러면 `scripts/upload-problems.mjs` 가 그대로 찾아 올린다.
"""
import io
import json
import os
import shutil
import numpy as np
from PIL import Image
import mnum
from cut import cuts, trim

BOOK = '유형만렙'
GRADE = '공통수학2'
SEM = 1
STEP = {'개념 확인': 'A 개념확인', '유형 완성': 'B 유형',
        '유형 점검': '유형점검', '실력 향상': 'C 실력향상'}
CIRCLE = '①②③④⑤'


def level(step, diff):
    if step == 'A 개념확인':
        return 1
    if step == 'C 실력향상':
        return 4
    if diff == '상':
        return 4
    return 3


def answer_kind(t):
    if not t:
        return 'image', None
    t = t.strip()
    if len(t) == 1 and t in CIRCLE:
        return 'choice', t
    try:
        int(t)
        return 'number', t
    except ValueError:
        return 'image', None


def main(out='out'):
    rows = json.load(io.open('cand.json', encoding='utf8'))
    asg = {int(k): v for k, v in json.load(io.open('assign.json')).items()}
    plan = {o['n']: o for o in json.load(io.open('plan.json', encoding='utf8'))}
    n2 = {v: k for k, v in asg.items()}
    C = cuts(rows, asg)
    base = os.path.join(out, '%s-%d' % (GRADE, SEM), BOOK)
    if os.path.isdir(base):
        shutil.rmtree(base)
    data = []
    thin = []
    byp = {}
    for n in range(1, 1273):
        byp.setdefault(rows[n2[n]]['pg'], []).append(n)
    made = 0
    for pg in sorted(byp):
        a = mnum.page(pg)
        for n in byp[pg]:
            o = plan[n]
            d = os.path.join(base, '%02d' % o['sub'])
            os.makedirs(d, exist_ok=True)
            _, x0, x1, y0, y1 = C[n2[n]]
            sub = trim(a[y0:y1, x0:x1])
            if sub is None or sub.shape[0] < 20:
                thin.append(n)
                continue
            Image.fromarray(sub).save(os.path.join(d, '%04d.png' % n))
            made += 1
            src = os.path.join('ans', '%04d.png' % n)
            if os.path.exists(src):
                shutil.copy(src, os.path.join(d, '%04d).png' % n))
            st = STEP[o['kind']]
            k, at = answer_kind(o['atext'])
            data.append(dict(b=BOOK, g=GRADE, s=SEM, n=o['sub'], t=o['subt'],
                             l='%04d' % n, c=o['code'], d=o['diff'], p=st,
                             e=bool(o['essay']), v=False, i=bool(o['rep']),
                             lv=level(st, o['diff']), pg=o['pp'],
                             k=k, a=at, x='png',
                             dir='%s-%d/%s/%02d' % (GRADE, SEM, BOOK, o['sub'])))
    json.dump(data, io.open('problems_data.json', 'w', encoding='utf8'), ensure_ascii=False)
    print('그림 %d장 · 자료 %d줄 · 너무 얇아 빠진 것 %d %s'
          % (made, len(data), len(thin), thin[:10]))
    return data


if __name__ == '__main__':
    main()
