# -*- coding: utf-8 -*-
"""pair_audit.mjs 가 받아 온 문제·정답을 **한 장에 나란히** 놓는다.

  python scripts/answers/pair_sheet.py <폴더> <나갈.png> [제목]

문제 밑에 「DB 글자 정답」을 같이 적는다 — 문제를 읽고 답을 머릿속으로 풀어
그 값과 맞는지 보기 위해서다. 그림만 맞대면 「값은 맞는데 남의 답」을 못 잡는다.
"""
import io
import json
import os
import sys

from PIL import Image, ImageDraw

d, out = sys.argv[1], sys.argv[2]
title = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(d)
rows = json.load(io.open(os.path.join(d, 'list.json'), encoding='utf8'))

QH, AH, W = 150, 46, 660
tiles = []
for r in rows:
    f = os.path.join(d, r['no'] + '_q.png')
    if not os.path.exists(f):
        continue
    q = Image.open(f).convert('RGB')
    q = q.crop((0, 0, q.width, min(q.height, QH)))
    sc = min(1.0, W / max(1, q.width))
    q = q.resize((int(q.width * sc), int(q.height * sc)), Image.LANCZOS)
    fa = os.path.join(d, r['no'] + '_a.png')
    a = None
    if os.path.exists(fa):
        a = Image.open(fa).convert('RGB')
        a = a.crop((0, 0, min(a.width, 300), min(a.height, AH)))
        s2 = min(2.2, 300 / max(1, a.width))
        a = a.resize((int(a.width * s2), int(a.height * s2)), Image.LANCZOS)
    tiles.append((r, q, a))

WD = 180 + max(max(q.width, a.width if a else 0) for _, q, a in tiles)
HT = 24 + sum(q.height + (a.height if a else 0) + 34 for _, q, a in tiles)
im = Image.new('RGB', (WD, HT), (255, 255, 255))
dr = ImageDraw.Draw(im)
dr.text((6, 6), title, fill=(0, 0, 0))
y = 24
for r, q, a in tiles:
    dr.text((4, y + 2), f"{r['no']} 문제", fill=(190, 30, 30))
    dr.text((4, y + 16), f"DB {r['txt']}", fill=(20, 90, 190))
    im.paste(q, (175, y))
    y += q.height + 3
    if a:
        dr.text((4, y + 2), '정답그림', fill=(120, 120, 120))
        im.paste(a, (175, y))
        y += a.height + 3
    dr.line([(0, y + 10), (WD, y + 10)], fill=(200, 200, 200))
    y += 22
im.save(out)
print(f'{len(tiles)}문항 → {out}')
