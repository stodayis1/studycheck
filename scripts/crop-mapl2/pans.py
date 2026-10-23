# -*- coding: utf-8 -*-
"""빠른정답에서 정답 그림을 오린다 (글자로 적기 어려운 것만).

빠른정답은 벡터 PDF 라 크게 키워도 또렷하다. 번호 오른쪽 한 칸을 그대로 오린다.
"""
import io
import json
import os
import re
import numpy as np
import pymupdf
from PIL import Image

CIRCLE = '①②③④⑤'


def kind_of(a):
    a = (a or '').strip()
    if len(a) == 1 and a in CIRCLE:
        return 'choice', a
    if re.fullmatch(r'-?\d{1,5}', a):
        return 'number', a
    return 'image', None


def crop(outdir='ans', dpi=360):
    q = json.load(io.open('quick.json', encoding='utf8'))
    d = pymupdf.open('quick.pdf')
    # 같은 줄에서 **다음 번호가 시작하는 자리**까지가 이 문항의 정답 칸이다
    byrow = {}
    for r in q:
        byrow.setdefault((r['pi'], round(r['y'] / 5)), []).append(r)
    nxt = {}
    for key, g in byrow.items():
        g.sort(key=lambda z: z['x'])
        for a, b in zip(g[:-1], g[1:]):
            nxt[a['n']] = b['x']
    os.makedirs(outdir, exist_ok=True)
    z = dpi / 72.0
    made = 0
    for r in q:
        # 글자로 적은 정답도 **그림을 함께** 만든다 — 답지에서 다른 교재와 모양을 맞추려고
        right = min(nxt.get(r['n'], r['x1'] + 56), r['x1'] + 56) - 2
        rect = pymupdf.Rect(r['x1'] + 0.5, r['y'] - 3.5, max(right, r['x1'] + 14), r['y1'] + 3.5)
        pm = d[r['pi']].get_pixmap(matrix=pymupdf.Matrix(z, z), clip=rect)
        a = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[:, :, :3]
        m = (a.min(2) < 200)
        cs = np.nonzero(m.any(0))[0]
        rs = np.nonzero(m.any(1))[0]
        if len(cs) and len(rs):
            a = a[max(0, rs[0] - 4):rs[-1] + 5, max(0, cs[0] - 4):cs[-1] + 5]
        Image.fromarray(a).save(os.path.join(outdir, '%04d.png' % r['n']))
        made += 1
    print('정답 그림 %d장' % made)
    return made


if __name__ == '__main__':
    crop()
