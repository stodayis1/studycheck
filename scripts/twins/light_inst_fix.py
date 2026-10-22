"""라이트쎈 — 지시문이 빠진 문항에 **원본 PDF 의 묶음 지시문**을 붙인다.

  python scripts/twins/light_inst_fix.py <작업폴더> <PDF> <qnums_ok.json> <id,id,…>

왜 PDF 에서 하나
  이웃 그림에서 띠를 떼어 붙이는 방법은 실패했다 (같은 문장이 두 번 나오거나 개념 상자를
  떼어 왔다). PDF 가 있으면 지시문 줄의 자리를 직접 찾을 수 있어 확실하다.

지시문은 어떻게 찾나
  「[0021~0024]」 는 **반쪽의 왼쪽 모서리**에 선 색 글자이고, 문항 번호보다 넓다
  (200dpi 에서 번호 ~75px, 지시문 머리 ~135px). 단이 아니라 **반쪽**에서 찾아야 한다 —
  한 칸 안에 문항이 가로로 둘씩 들어가므로(0021 | 0022) 단으로 나누면 지시문을 놓친다.
  그 줄부터 **그 묶음의 첫 문항 바로 위**까지가 띠다 (보기 상자·그림이 그 안에 들어간다).

작업폴더에는 `cur/`(지금 올라가 있는 그림)와 `cur/meta.json` 이 있어야 한다
  node scripts/twins/byid.mjs <작업폴더>/cur <id,id,…>
"""
import io
import json
import os
import sys
import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage

DPI = 200


def page(doc, pi):
    pm = doc[pi].get_pixmap(dpi=DPI)
    return np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].copy()


def wide_color_lines(a, x0, x1, minw=108):
    x = a[:, x0:x1].astype(int)
    m = ((x.max(2) - x.min(2)) >= 50) & (x.min(2) < 200)
    lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, 13))))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        w = sl[1].stop - sl[1].start
        h = sl[0].stop - sl[0].start
        if w >= minw and 14 <= h <= 46 and sl[1].start <= 46:
            out.append((sl[0].start, sl[0].stop))
    return sorted(out)


def trim(a, pad=8):
    ys = np.where((a.min(2) < 185).any(1))[0]
    return a[max(0, ys[0] - pad):ys[-1] + pad + 1] if len(ys) else None


def main():
    work, pdf, nums, ids = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    doc = pymupdf.open(pdf)
    rows = json.load(io.open(nums, encoding='utf8'))
    by = {r['no']: r for r in rows}
    cur = json.load(io.open(os.path.join(work, 'cur', 'meta.json'), encoding='utf8'))
    os.makedirs(os.path.join(work, 'fixed'), exist_ok=True)
    pages = {}
    ok, miss = 0, []
    for c in cur:
        n = int(c['local_no'])
        r = by.get(n)
        if r is None:
            miss.append((c['local_no'], '위치 없음'))
            continue
        if r['pg'] not in pages:
            pages[r['pg']] = page(doc, r['pg'])
        a = pages[r['pg']]
        W = a.shape[1]
        same = [q for q in rows if q['pg'] == r['pg'] and q['half'] == r['half']]
        hx0 = max(30, min(q['x0'] for q in same) - 16)
        hx1 = (W // 2 - 20) if r['half'] == 0 else W - 34
        lines = [L for L in wide_color_lines(a, hx0, hx1) if L[1] < r['y0'] - 10]
        if not lines:
            miss.append((c['local_no'], '지시문 없음'))
            continue
        b = lines[-1]
        first = min([q['y0'] for q in same if q['y0'] > b[1]] or [r['y0']])
        band = trim(a[max(0, b[0] - 10): max(b[1] + 6, first - 12), hx0:hx1])
        if band is None or band.shape[0] < 16:
            miss.append((c['local_no'], '띠 비었음'))
            continue
        q = np.array(Image.open(os.path.join(work, 'cur', f"{c['id']}.png")).convert('RGB'))
        w = max(band.shape[1], q.shape[1])

        def wide(z):
            return z if z.shape[1] == w else np.hstack([z, np.full((z.shape[0], w - z.shape[1], 3), 255, np.uint8)])

        out = np.vstack([wide(band), np.full((12, w, 3), 255, np.uint8), wide(q)])
        Image.fromarray(out).save(os.path.join(work, 'fixed', f"{c['id']}.png"))
        ok += 1
    print(f'지시문 붙임 {ok} · 못 붙임 {len(miss)}')
    for m in miss:
        print('   ', m)


if __name__ == '__main__':
    main()
