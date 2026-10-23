# -*- coding: utf-8 -*-
"""문항 그림을 자르고 업로드 자료를 만든다 (마플시너지 공통수학2)."""
import io
import json
import os
import re
import shutil
import numpy as np
from PIL import Image
import mnum
from cut import cuts, trim

BOOK = '마플시너지'
GRADE = '공통수학2'
SEM = 1
STEP = {'STEP1': '유형', 'STEP2': '서술형', 'STEP3': '1등급'}
LEVEL = {'유형': 3, '서술형': 4, '1등급': 5}
CIRCLE = '①②③④⑤'


def kind_of(a):
    a = (a or '').strip()
    if len(a) == 1 and a in CIRCLE:
        return 'choice', a
    if re.fullmatch(r'-?\d{1,5}', a):
        return 'number', a
    return 'image', None


def main(out='out'):
    rows = json.load(io.open('cand.json', encoding='utf8'))
    asg = {int(k): v for k, v in json.load(io.open('assign.json')).items()}
    plan = {q['n']: q for q in json.load(io.open('plan.json', encoding='utf8'))}
    quick = {r['n']: r for r in json.load(io.open('quick.json', encoding='utf8'))}
    std = {t['code']: t for t in json.load(io.open('std.json', encoding='utf8'))}
    n2 = {v: k for k, v in asg.items()}
    C = cuts(rows, asg)
    base = os.path.join(out, '%s-%d' % (GRADE, SEM), BOOK)
    if os.path.isdir(base):
        shutil.rmtree(base)
    data = []
    thin = []
    byp = {}
    for n in range(1, 1896):
        byp.setdefault(rows[n2[n]]['pg'], []).append(n)
    made = 0
    for pg in sorted(byp):
        a = mnum.page(pg)
        for n in byp[pg]:
            q = plan[n]
            st = std[q['code']]
            sub = st['sub_chapter_no']
            d = os.path.join(base, '%02d' % sub)
            os.makedirs(d, exist_ok=True)
            _, x0, x1, y0, y1 = C[n2[n]]
            im = trim(a[y0:y1, x0:x1])
            if im is None or im.shape[0] < 20:
                thin.append(n)
                continue
            Image.fromarray(im).save(os.path.join(d, '%04d.png' % n))
            made += 1
            src = os.path.join('ans', '%04d.png' % n)
            if os.path.exists(src):
                shutil.copy(src, os.path.join(d, '%04d).png' % n))
            step = STEP[q['step']]
            k, at = kind_of(quick[n]['a'])
            data.append(dict(b=BOOK, g=GRADE, s=SEM, n=sub, t=st['sub_chapter_title'],
                             l='%04d' % n, c=q['code'], d=None, p=step,
                             e=(step == '서술형'), v=False, i=False,
                             lv=LEVEL[step], k=k, a=at, x='png',
                             dir='%s-%d/%s/%02d' % (GRADE, SEM, BOOK, sub)))
    json.dump(data, io.open('problems_data.json', 'w', encoding='utf8'), ensure_ascii=False)
    print('그림 %d장 · 자료 %d줄 · 얇아 빠진 것 %d %s'
          % (made, len(data), len(thin), thin[:8]))


if __name__ == '__main__':
    main()
