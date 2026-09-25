"""해설집 한 쪽을 **세로 눈금과 함께** 그려 준다 (풀이를 손으로 집을 때 쓴다).

자동으로 못 찾은 몇 개를 사람이 직접 집을 때, 눈금이 있으면 한 번만 보고 좌표를 적을 수 있다.

  python scripts/crop-solutions/ruler.py "<해설집.pdf>" <쪽번호> <나갈파일> [--dpi 200] [--col 0|1|both]
  python scripts/crop-solutions/ruler.py "<해설집.pdf>" <쪽번호> <나갈파일> --cut 0,380,980  # 이렇게 잘라 저장
"""
import argparse
import os

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFont


def page_img(pdf, pg, dpi):
    d = pymupdf.open(pdf)
    pm = d[pg].get_pixmap(dpi=dpi)
    return np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].copy()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('page', type=int)
    ap.add_argument('out')
    ap.add_argument('--dpi', type=int, default=200)
    ap.add_argument('--col', default='both')          # 0=왼쪽 단, 1=오른쪽 단
    # 여러 쪽·단을 한 장에 모아 본다: --many "26:0,28:1,29:0"
    ap.add_argument('--many', default='')
    ap.add_argument('--cut', default='')              # "단,위,아래" → 그 부분만 저장
    ap.add_argument('--scale', type=float, default=0.55)
    a = ap.parse_args()

    if a.many:
        picks = [tuple(int(v) for v in t.split(':')) for t in a.many.split(',')]
        F = ImageFont.truetype(r'C:\Windows\Fonts\malgunbd.ttf', 15)
        pad = 62
        parts = []
        for pg, c in picks:
            im = page_img(a.pdf, pg, a.dpi)
            H, W = im.shape[:2]
            mid = W // 2
            x0, x1 = (0, mid) if c == 0 else (mid, W)
            parts.append((pg, c, Image.fromarray(im[:, x0:x1])))
        H = max(p.height for _, _, p in parts)
        sheet = Image.new('RGB', (sum(p.width + pad for _, _, p in parts), H), 'white')
        dr = ImageDraw.Draw(sheet)
        x = 0
        for pg, c, p in parts:
            for y in range(0, H, 100):
                dr.line([(x, y), (x + pad + p.width, y)], fill=(255, 190, 190), width=1)
                dr.text((x + 4, y + 2), str(y), fill=(200, 40, 40), font=F)
            dr.text((x + 6, 4), f'p{pg}-{c}', fill=(0, 120, 0), font=F)
            sheet.paste(p, (x + pad, 0))
            x += pad + p.width
        sheet = sheet.resize((int(sheet.width * a.scale), int(sheet.height * a.scale)), Image.LANCZOS)
        sheet.save(a.out)
        print(a.out, sheet.size)
        return

    im = page_img(a.pdf, a.page, a.dpi)
    H, W = im.shape[:2]
    mid = W // 2

    if a.cut:
        c, y0, y1 = [int(t) for t in a.cut.split(',')]
        x0, x1 = (0, mid) if c == 0 else (mid, W)
        Image.fromarray(im[y0:y1, x0:x1]).save(a.out)
        print(a.out, (x1 - x0, y1 - y0))
        return

    cols = [0, 1] if a.col == 'both' else [int(a.col)]
    parts = []
    for c in cols:
        x0, x1 = (0, mid) if c == 0 else (mid, W)
        parts.append((c, Image.fromarray(im[:, x0:x1])))

    F = ImageFont.truetype(r'C:\Windows\Fonts\malgunbd.ttf', 15)
    pad = 62
    sheet = Image.new('RGB', (sum(p.width for _, p in parts) + pad * len(parts), H), 'white')
    dr = ImageDraw.Draw(sheet)
    x = 0
    for c, p in parts:
        dr.text((x + 6, 4), f'단{c}', fill=(0, 120, 0), font=F)
        for y in range(0, H, 100):
            dr.line([(x, y), (x + pad + p.width, y)], fill=(255, 190, 190), width=1)
            dr.text((x + 4, y + 2), str(y), fill=(200, 40, 40), font=F)
        sheet.paste(p, (x + pad, 0))
        x += pad + p.width
    sheet = sheet.resize((int(sheet.width * a.scale), int(sheet.height * a.scale)), Image.LANCZOS)
    sheet.save(a.out)
    print(a.out, sheet.size, f'(원본 높이 {H}, 눈금은 원본 좌표)')


if __name__ == '__main__':
    main()
