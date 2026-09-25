"""해설집에서 **지정한 문항 번호**의 풀이만 골라 자른다.

crop.py 는 책 한 권을 통째로 훑는 도구다. 학습지 한 장(24문항)에 필요한 풀이는 몇십 개뿐이라
그때는 이쪽이 빠르고 확실하다 — 찾은 것을 한 장으로 모아 눈으로 확인할 수 있다.

  python scripts/crop-solutions/pick.py "<해설집.pdf>" <나갈폴더> --digits <본보기폴더> \
         --nums 74,75,106,117 [--dpi 200]

번호를 못 찾으면 그 번호는 건너뛰고, 마지막에 못 찾은 목록을 알려 준다.
결과: <나갈폴더>/0074.png … , index.json, contact.png(모아보기)
"""
import argparse
import json
import os
import sys

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crop import colored, labels, glyphs, set_scale, trim   # noqa: E402
import crop as _c                                            # noqa: E402


def read_labels(im, T, names, top, bottom):
    """한 쪽에서 번호 자리를 찾아 (단, y, 읽은값, 또렷함) 목록을 준다."""
    m = colored(im.astype(int))
    H, W = im.shape[:2]
    mid = W // 2
    out = []
    for c, (x0, x1) in enumerate([(0, mid), (mid, W)]):
        gs = [g for g in labels(m, x0, x1) if top <= g['y0'] <= H - bottom]
        for g in sorted(gs, key=lambda g: g['y0']):
            s = ''
            conf = 1.0
            for v in glyphs(m, g):
                v = np.asarray(v)
                if not v.any():
                    s += '?'
                    conf = 0
                    continue
                sim = T @ v
                k = int(np.argmax(sim))
                s += names[k]
                conf = min(conf, float(sim[k]))
            out.append(dict(col=c, x0=x0, x1=x1, y=g['y0'], num=s, conf=conf))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('out')
    ap.add_argument('--digits', required=True)
    ap.add_argument('--nums', required=True)
    ap.add_argument('--dpi', type=int, default=200)
    ap.add_argument('--top', type=int, default=90)
    ap.add_argument('--bottom', type=int, default=80)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    set_scale(a.dpi)

    T = np.load(os.path.join(a.digits, 'digits.npy'))
    names = open(os.path.join(a.digits, 'digits.txt'), encoding='utf8').read().split(',')
    want = sorted({int(x) for x in a.nums.split(',') if x.strip()})

    d = pymupdf.open(a.pdf)
    # 쪽을 훑으며 번호 자리를 모은다 (읽은 값이 목표와 같은 것만 쓴다)
    found, pages = {}, {}
    seq = []          # (쪽, 단, y, 읽은값)
    for i in range(len(d)):
        pm = d[i].get_pixmap(dpi=a.dpi)
        im = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].copy()
        rows = read_labels(im, T, names, a.top, a.bottom)
        if rows:
            pages[i] = im
        for r in rows:
            seq.append((i, r['col'], r['x0'], r['x1'], r['y'], r['num'], r['conf']))
        if i % 20 == 0:
            print(f'  쪽 {i}/{len(d)}', flush=True)

    # 읽은 순서대로 정렬 (쪽 → 단 → 위에서 아래로)
    seq.sort(key=lambda t: (t[0], t[1], t[4]))

    # 못 읽은 자리는 **앞뒤 번호로** 채운다.
    # 해설집은 1번부터 빠짐없이 이어지므로, 확실히 읽은 두 번호 사이의 자리 수가
    # 그 사이 번호 수와 딱 맞으면 순서대로 붙여도 틀릴 수가 없다.
    val = [int(t[5]) if t[5].isdigit() and len(t[5]) == 4 else None for t in seq]
    sure = [i2 for i2, v in enumerate(val) if v is not None]
    for p1, p2 in zip(sure, sure[1:]):
        if val[p2] - val[p1] == p2 - p1 and p2 - p1 > 1:
            for t in range(1, p2 - p1):
                val[p1 + t] = val[p1] + t
    seq = [(t[0], t[1], t[2], t[3], t[4], f'{val[i2]:04d}' if val[i2] else t[5], t[6])
           for i2, t in enumerate(seq)]

    for j, (pg, col, x0, x1, y, num, conf) in enumerate(seq):
        if not num.isdigit() or int(num) not in want or int(num) in found:
            continue
        H = pages[pg].shape[0]
        # 같은 단의 다음 번호까지가 이 풀이다. 단 끝이면 다음 단으로 이어 붙인다
        parts = []
        nxt = next((t for t in seq[j + 1:] if (t[0], t[1]) == (pg, col)), None)
        if nxt:
            parts.append((pg, x0, x1, max(a.top, y - 8), nxt[4] - 8))
        else:
            parts.append((pg, x0, x1, max(a.top, y - 8), H - a.bottom))
            if j + 1 < len(seq):
                n2 = seq[j + 1]
                parts.append((n2[0], n2[2], n2[3], a.top, n2[4] - 8))
        ims = [Image.fromarray(pages[p][yy0:yy1, xx0:xx1]) for p, xx0, xx1, yy0, yy1 in parts if yy1 - yy0 > 20]
        if not ims:
            continue
        W = max(x.width for x in ims)
        canvas = Image.new('RGB', (W, sum(x.height for x in ims)), 'white')
        yy = 0
        for x in ims:
            canvas.paste(x, (0, yy))
            yy += x.height
        canvas = canvas.crop(trim(canvas))
        name = f'{int(num):04d}.png'
        canvas.save(os.path.join(a.out, name))
        found[int(num)] = dict(file=name, page=pg, conf=round(conf, 2))

    json.dump({str(k): v for k, v in found.items()},
              open(os.path.join(a.out, 'index.json'), 'w', encoding='utf8'), ensure_ascii=False)
    miss = [n for n in want if n not in found]
    print(f'찾음 {len(found)}/{len(want)}' + (f' · 못 찾음 {miss}' if miss else ''))

    # 눈으로 확인할 모아보기 한 장
    if found:
        F = ImageFont.truetype(r'C:\Windows\Fonts\malgunbd.ttf', 20)
        ims = []
        for n in sorted(found):
            im = Image.open(os.path.join(a.out, found[n]['file'])).convert('RGB')
            im.thumbnail((700, 460))
            ims.append((n, im))
        W = max(i.width for _, i in ims) + 16
        Ht = sum(i.height + 34 for _, i in ims)
        c = Image.new('RGB', (W, Ht), 'white')
        dr = ImageDraw.Draw(c)
        y = 0
        for n, im in ims:
            dr.text((6, y + 6), f'{n:04d}', fill=(200, 40, 40), font=F)
            c.paste(im, (8, y + 30))
            y += im.height + 34
        c.save(os.path.join(a.out, 'contact.png'))
        print('모아보기 →', os.path.join(a.out, 'contact.png'))


if __name__ == '__main__':
    main()
