# -*- coding: utf-8 -*-
"""잘라 둔 정답 그림을 **번호와 함께 한 장에 여러 개** 모아 읽기 좋게 만든다.

  python scripts/answers/sheet_read.py <정답그림폴더> <나갈폴더> [--per 30] [--cols 3] [--from 0001] [--to 0300]

판독1·판독2 를 **다르게** 담아야 같은 실수를 두 번 하지 않는다 →
  1차: --per 30 --cols 3 (작게 많이)   2차: --per 20 --cols 2 (크게 적게)

sheet_check.py 와 다른 점: 여기서는 **넣을 값을 적지 않는다**. 값이 적혀 있으면
그 값에 눈이 끌려 그림을 그대로 읽지 못한다.
"""
import io
import json
import os
import sys

from PIL import Image, ImageDraw

d, out = sys.argv[1], sys.argv[2]


def opt(name, dflt):
    i = sys.argv.index(name) if name in sys.argv else -1
    return sys.argv[i + 1] if i > 0 else dflt


PER, COLS = int(opt('--per', 30)), int(opt('--cols', 3))
LO, HI = opt('--from', None), opt('--to', None)
os.makedirs(out, exist_ok=True)

rows = json.load(io.open(os.path.join(d, 'list.json'), encoding='utf8'))
rows = [r for r in rows if os.path.exists(os.path.join(d, f"{r['id']}.png"))]
if LO:
    rows = [r for r in rows if r['local_no'] >= LO]
if HI:
    rows = [r for r in rows if r['local_no'] <= HI]
rows.sort(key=lambda r: r['local_no'])

CW = 1000 // COLS
CH = 78 if PER >= 30 else 104

pages = [rows[i:i + PER] for i in range(0, len(rows), PER)]
for k, pg in enumerate(pages):
    n = (len(pg) + COLS - 1) // COLS
    im = Image.new('RGB', (CW * COLS, CH * n), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    for i, r in enumerate(pg):
        a = Image.open(os.path.join(d, f"{r['id']}.png")).convert('RGB')
        sc = min((CW - 70) / a.width, (CH - 14) / a.height, 3.0)
        a = a.resize((max(1, int(a.width * sc)), max(1, int(a.height * sc))))
        x, y = (i % COLS) * CW, (i // COLS) * CH
        dr.rectangle([x, y, x + CW - 2, y + CH - 2], outline=(215, 215, 215))
        dr.text((x + 5, y + CH // 2 - 6), r['local_no'], fill=(190, 30, 30))
        im.paste(a, (x + 62, y + 8))
    im.save(os.path.join(out, f'r{k:02d}.png'))
print(f'{len(rows)}개를 {len(pages)}장에 담았다 → {out}')
