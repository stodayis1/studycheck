# -*- coding: utf-8 -*-
"""넣으려는 정답을 **그림과 나란히** 놓아 눈으로 마지막 확인을 한다.

  python scripts/answers/sheet_check.py <정답그림폴더> <목록.json> <나갈폴더> [--per 30]

목록.json 은 [{"id":.., "no":"0001", "txt":"5"}, ...] 또는
             [{"id":.., "no":.., "before":"⑤", "after":"③"}, ...] 꼴.

한 칸에 **번호 · 넣을 값 · 그림**을 나란히 둔다. 값과 그림이 다르면 바로 눈에 띈다.
"""
import io
import json
import os
import sys

from PIL import Image, ImageDraw

ans_dir, list_p, out = sys.argv[1], sys.argv[2], sys.argv[3]
pi = sys.argv.index('--per') if '--per' in sys.argv else -1
PER = int(sys.argv[pi + 1]) if pi > 0 else 30
os.makedirs(out, exist_ok=True)

rows = json.load(io.open(os.path.join(ans_dir, 'list.json'), encoding='utf8'))
byno = {r['local_no']: r['id'] for r in rows}
items = json.load(io.open(list_p, encoding='utf8'))

CW, CH, COLS = 330, 78, 3


def label(it):
    if 'after' in it:
        return f"{it['no']}  {it['before']} → {it['after']}"
    return f"{it['no']}  {it['txt']}"


n = 0
page = []
made = []
for it in items:
    pid = byno.get(it['no'])
    if pid is None:
        continue
    f = os.path.join(ans_dir, f'{pid}.png')
    if not os.path.exists(f):
        continue
    page.append((it, f))
    if len(page) == PER:
        made.append(page)
        page = []
if page:
    made.append(page)

for k, pg in enumerate(made):
    rows_n = (len(pg) + COLS - 1) // COLS
    im = Image.new('RGB', (CW * COLS, CH * rows_n), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    for i, (it, f) in enumerate(pg):
        a = Image.open(f).convert('RGB')
        sc = min((CW - 150) / a.width, (CH - 14) / a.height, 2.6)
        a = a.resize((max(1, int(a.width * sc)), max(1, int(a.height * sc))))
        x, y = (i % COLS) * CW, (i // COLS) * CH
        dr.rectangle([x, y, x + CW - 2, y + CH - 2], outline=(215, 215, 215))
        dr.text((x + 6, y + CH // 2 - 6), label(it), fill=(190, 30, 30))
        im.paste(a, (x + 142, y + 8))
    p = os.path.join(out, f'check{k}.png')
    im.save(p)
    n += len(pg)
print(f'{n}개를 {len(made)}장에 담았다 → {out}')
