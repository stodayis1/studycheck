"""해설집 번호 글꼴로 숫자 본보기(0~9) 만들기.

교재 본문과 해설집은 글꼴이 달라서 `page-map/seed.npy`(교재용)로 읽으면 0을 9로 읽는다.
그래서 이 해설집에서 번호 글자를 다 모아 **비슷한 것끼리 묶고**, 묶음 대표 그림을 한 장으로
뽑아 사람이 한 번만 보고 이름(0~9)을 적어 주면 된다.

  1) python scripts/crop-solutions/digits.py <해설집PDF> <작업폴더> --collect
     → 작업폴더/glyphs.npy, clusters.png  (묶음 대표 그림)
  2) clusters.png 를 보고 --label "0,1,2,..." 로 이름을 적어 준다
     → 작업폴더/digits.npy (crop.py 가 쓴다)
"""
import argparse
import os

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFont

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crop as _c   # noqa: E402
from crop import colored, labels, GW, GH, glyphs, set_scale   # noqa: E402


def cell(m, b, y0, y1):
    p = m[y0:y1, b[0]:b[1]]
    ys = np.where(p.any(1))[0]
    xs = np.where(p.any(0))[0]
    if not len(ys):
        return None
    q = (p[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1] * 255).astype(np.uint8)
    h0, w0 = q.shape
    nw = max(1, min(GW, int(round(w0 * GH / h0))))
    c = Image.new('L', (GW, GH), 0)
    c.paste(Image.fromarray(q).resize((nw, GH), Image.BILINEAR), ((GW - nw) // 2, 0))
    return np.asarray(c, float)


def norm(v):
    v = v.ravel().astype(float)
    v -= v.mean()
    n = np.linalg.norm(v)
    return v / (n or 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('work')
    ap.add_argument('--collect', action='store_true')
    ap.add_argument('--label', default='')
    ap.add_argument('--pages', default='')
    ap.add_argument('--dpi', type=int, default=200)
    ap.add_argument('--k', type=int, default=24)
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    gp = os.path.join(a.work, 'glyphs.npy')

    if a.collect:
        set_scale(a.dpi)
        d = pymupdf.open(a.pdf)
        rng = range(len(d))
        if a.pages:
            s, e = a.pages.split('-')
            rng = range(int(s), int(e) + 1)
        raw = []
        for i in rng:
            pm = d[i].get_pixmap(dpi=a.dpi)
            im = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].astype(int)
            m = colored(im)
            H, W = im.shape[:2]
            mid = W // 2
            for x0, x1 in [(0, mid), (mid, W)]:
                for g in labels(m, x0, x1):
                    if not (90 * _c.SC <= g['y0'] <= H - 80 * _c.SC):
                        continue
                    # crop.py 가 읽을 때와 **똑같이** 잘라 모은다.
                    # (다르게 모으면 본보기와 읽는 모양이 어긋나 닮은 정도가 낮게 나온다)
                    xa = g['boxes'][0][0]
                    xb = max(g['boxes'][-1][1], xa + int(_c.DW * 4))
                    step = (xb - xa) / 4
                    for i2 in range(4):
                        b = [int(xa + i2 * step), int(xa + (i2 + 1) * step), g['y0'], g['y1']]
                        c = cell(m, b, g['y0'], g['y1'])
                        if c is not None:
                            raw.append(c)
            if i % 10 == 0:
                print(f'  쪽 {i} 누적 글자 {len(raw)}', flush=True)
        X = np.stack(raw)
        np.save(gp, X)
        print(f'글자 {len(X)}개 모음 → {gp}')

        # 비슷한 것끼리 묶기 (간단한 k-means)
        V = np.stack([norm(x) for x in X])
        rs = np.random.RandomState(0)
        C = V[rs.choice(len(V), a.k, replace=False)]
        for _ in range(30):
            lab = np.argmax(V @ C.T, 1)
            for k in range(a.k):
                sel = V[lab == k]
                if len(sel):
                    C[k] = norm(sel.mean(0))
        order = np.argsort([-int((lab == k).sum()) for k in range(a.k)])
        F = ImageFont.truetype(r'C:\Windows\Fonts\malgunbd.ttf', 16)
        CW, CH2 = 90, 74
        sheet = Image.new('RGB', (CW * 8, CH2 * ((a.k + 7) // 8)), 'white')
        dr = ImageDraw.Draw(sheet)
        for j, k in enumerate(order):
            sel = X[lab == k]
            if not len(sel):
                continue
            avg = Image.fromarray(sel.mean(0).astype(np.uint8)).resize((GW * 3, GH * 3), Image.NEAREST)
            x = (j % 8) * CW
            y = (j // 8) * CH2
            dr.rectangle([x, y, x + CW - 2, y + CH2 - 2], outline=(220, 220, 220))
            dr.text((x + 4, y + 2), f'{j + 1}:{len(sel)}', fill=(200, 40, 40), font=F)
            sheet.paste(avg, (x + 40, y + 12))
        sheet.save(os.path.join(a.work, 'clusters.png'))
        np.save(os.path.join(a.work, 'centers.npy'), C[order])
        print(f'묶음 {a.k}개 → {os.path.join(a.work, "clusters.png")}  (순서대로 이름을 적어 주세요)')
        return

    if a.label:
        names = [t.strip() for t in a.label.split(',')]
        C = np.load(os.path.join(a.work, 'centers.npy'))
        assert len(names) == len(C), f'이름 {len(names)}개 ≠ 묶음 {len(C)}개'
        keep = [(n, c) for n, c in zip(names, C) if n != '-']
        np.save(os.path.join(a.work, 'digits.npy'), np.stack([c for _, c in keep]))
        with open(os.path.join(a.work, 'digits.txt'), 'w', encoding='utf8') as f:
            f.write(','.join(n for n, _ in keep))
        print(f'본보기 {len(keep)}개 저장 → {a.work}/digits.npy')


if __name__ == '__main__':
    main()
