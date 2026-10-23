"""한 유형의 문항 그림을 **2열**로 모아 붙인다 (쌍둥이·유사 대조용).

sheet.py 는 한 장에 6문항밖에 못 담아 유형 하나에 9장이 나왔다.
쌍둥이는 보통 **첫 두세 줄**로 판가름 나므로 길면 잘라 담고, 2열로 쌓아 한 장에 12~16문항을 담는다.
  python scripts/twins/sheet2.py <폴더> <나갈이름> [--cap 330]
"""
import io
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W = 520          # 문항 그림 가로
PAD = 104        # 이름표 칸
MAXH = 1500      # 한 장의 최대 높이 — 넘으면 화면에서 줄어들어 글씨를 못 읽는다
GAP = 8


def font(sz=14):
    for p in (r'C:\Windows\Fonts\malgun.ttf', r'C:\Windows\Fonts\gulim.ttc'):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def build(d, out_prefix, cap=330):
    meta = json.load(io.open(os.path.join(d, 'meta.json'), encoding='utf8'))
    F = font()
    items = []
    for r in meta:
        f = os.path.join(d, f"{r['id']}.png")
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert('RGB')
        if im.width != W:
            im = im.resize((W, max(1, round(im.height * W / im.width))), Image.LANCZOS)
        a = np.array(im)
        cut = a.shape[0] > cap
        if cut:
            a = a[:cap]
        items.append((r, a, cut))
    # 길이가 비슷한 것끼리 붙여 두면 쌍둥이가 눈에 더 잘 띈다
    items.sort(key=lambda t: (t[0]['book'], t[0]['local_no']))
    col = [[], []]
    colh = [0, 0]
    pages = []
    for it in items:
        h = it[1].shape[0] + GAP
        k = 0 if colh[0] <= colh[1] else 1
        if colh[k] + h > MAXH:
            if colh[1 - k] + h <= MAXH:
                k = 1 - k
            else:
                pages.append(col)
                col = [[], []]
                colh = [0, 0]
                k = 0
        col[k].append(it)
        colh[k] += h
    if col[0] or col[1]:
        pages.append(col)
    names = []
    for p, cols in enumerate(pages):
        H = max(sum(a.shape[0] + GAP for _, a, _ in c) or 1 for c in cols)
        CW = PAD + W
        sh = np.full((H, CW * 2, 3), 234, np.uint8)
        pos = []
        for ci, c in enumerate(cols):
            y = 0
            for r, a, cut in c:
                x = ci * CW
                sh[y:y + a.shape[0], x + PAD:x + PAD + W] = a
                pos.append((r, x, y, a.shape[0], cut))
                y += a.shape[0] + GAP
        im = Image.fromarray(sh)
        dr = ImageDraw.Draw(im)
        for r, x, y, h, cut in pos:
            dr.line([(x + PAD - 2, y), (x + PAD - 2, y + h)], fill=(190, 190, 190))
            dr.text((x + 3, y + 3), f"{r['id']}", fill=(170, 0, 0), font=F)
            dr.text((x + 3, y + 20), f"{r['book'][:7]}", fill=(40, 40, 40), font=F)
            dr.text((x + 3, y + 37), f"{r['local_no']} L{r['level']}", fill=(90, 90, 90), font=F)
            if cut:
                dr.text((x + 3, y + 54), '…이어짐', fill=(0, 100, 160), font=F)
        name = f'{out_prefix}_{p}.png'
        im.save(name)
        names.append(name)
        print(f'{name}  {im.size}  문항 {len(pos)}개')
    return names


if __name__ == '__main__':
    cap = 330
    if '--cap' in sys.argv:
        cap = int(sys.argv[sys.argv.index('--cap') + 1])
    build(sys.argv[1], sys.argv[2], cap)
