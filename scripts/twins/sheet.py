"""한 유형의 문항 그림을 한 장에 모아 붙인다 (쌍둥이·유사 대조용).

문항마다 「교재 · 번호 · 레벨」을 왼쪽에 적어 둬야 나중에 어느 문항을 가리키는지 말할 수 있다.
그림 높이가 제각각이라 가로폭만 맞추고 세로로 쌓는다. 너무 길어지면 여러 장으로 나눈다.
"""
import json
import io
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W = 560          # 문항 그림 가로
PAD = 118        # 왼쪽 이름표 칸
MAXH = 1500      # 한 장의 최대 높이 — 더 크면 화면에서 줄어들어 글씨를 못 읽는다


def font(sz=15):
    for p in (r'C:\Windows\Fonts\malgun.ttf', r'C:\Windows\Fonts\gulim.ttc'):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def build(d, out_prefix):
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
        items.append((r, np.array(im)))
    pages, cur, h = [], [], 0
    for r, a in items:
        if cur and h + a.shape[0] + 10 > MAXH:
            pages.append(cur); cur, h = [], 0
        cur.append((r, a)); h += a.shape[0] + 10
    if cur:
        pages.append(cur)
    names = []
    for k, pg in enumerate(pages):
        H = sum(a.shape[0] + 10 for _, a in pg)
        sh = np.full((H, W + PAD, 3), 232, np.uint8)
        y = 0
        for _, a in pg:
            sh[y:y + a.shape[0], PAD:PAD + W] = a
            y += a.shape[0] + 10
        im = Image.fromarray(sh)
        dr = ImageDraw.Draw(im)
        y = 0
        for r, a in pg:
            lv = r.get('level')
            dr.text((4, y + 4), f"{r['book']}", fill=(150, 0, 0), font=F)
            dr.text((4, y + 24), f"{r['local_no']}", fill=(0, 0, 0), font=F)
            dr.text((4, y + 44), f"L{lv if lv is not None else '-'} {r.get('difficulty') or ''}", fill=(0, 90, 150), font=F)
            dr.text((4, y + 64), f"#{r['id']}", fill=(120, 120, 120), font=F)
            y += a.shape[0] + 10
        name = f'{out_prefix}_{k}.png' if len(pages) > 1 else f'{out_prefix}.png'
        im.save(name)
        names.append((name, im.size, len(pg)))
    for n, s, c in names:
        print(f'{n}  {s}  문항 {c}개')
    return names


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
