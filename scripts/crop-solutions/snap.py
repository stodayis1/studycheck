"""대강 찍은 위치를 **번호 줄에 딱 맞춰** 풀이를 자른다.

눈금 그림을 보고 손으로 적은 y 는 ±50px 쯤 어긋난다. 그대로 자르면
앞 문항 꼬리가 섞이거나 제 번호 줄이 잘린다.
그래서 적어 둔 위치 둘레(±140px)에서 **번호처럼 생긴 색 덩어리**를 찾아
거기에 붙이고, 그 단의 다음 번호 바로 앞까지를 한 풀이로 삼는다.

  python scripts/crop-solutions/snap.py <spec.json> <나갈폴더>

spec.json 생김새
  {"pdf": "...", "wmin": 54, "wmax": 66,
   "items": {"246": [[26, 0, 600]], "279": [[29,0,2070],[29,1,60]]}}
     · [쪽, 단, 대강의 번호 줄 y]  — 두 개면 단을 넘어가며 이어 붙인다
     · 이어지는 조각(두 번째부터)은 번호가 없으므로 그 단의 첫 번호 앞까지 쓴다
"""
import json
import os
import sys

import numpy as np
import pymupdf
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crop import colored, labels, set_scale, trim   # noqa: E402

TOP, BOTTOM = 90, 80


def main():
    spec = json.load(open(sys.argv[1], encoding='utf8'))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    dpi = spec.get('dpi', 200)
    set_scale(dpi)
    wmin, wmax = spec.get('wmin', 54), spec.get('wmax', 70)
    d = pymupdf.open(spec['pdf'])
    cache, poscache = {}, {}

    def page(i):
        if i not in cache:
            pm = d[i].get_pixmap(dpi=dpi)
            cache[i] = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].copy()
        return cache[i]

    def nums(pg, col):
        """그 단에서 번호처럼 생긴 색 덩어리의 y 목록."""
        key = (pg, col)
        if key in poscache:
            return poscache[key]
        im = page(pg)
        m = colored(im.astype(int))
        H, W = im.shape[:2]
        mid = W // 2
        x0, x1 = (0, mid) if col == 0 else (mid, W)
        gs = [g for g in labels(m, x0, x1) if TOP <= g['y0'] <= H - BOTTOM]
        ys = []
        for g in gs:
            a, b = g['boxes'][0][0], g['boxes'][-1][1]
            if not (wmin <= b - a <= wmax):
                continue
            # 「풀이」·「전략」 딱지도 폭이 번호와 비슷해 여기서는 못 가른다.
            # (색 밀도로 갈라 봤지만 번호도 0.6~0.8 이라 같이 걸러져 오히려 망가졌다)
            # → 걸러내지 말고, 잡힌 자리 중 어느 것이 번호인지는 사람이 한 번 보고 정한다.
            ys.append(g['y0'])
        ys.sort()
        poscache[key] = ys
        return ys

    index, warn = {}, []
    for k, parts in spec['items'].items():
        n = int(k)
        pieces = []
        for j, part in enumerate(parts):
            pg, col, approx = part[0], part[1], part[2]
            win = part[3] if len(part) > 3 else 140
            im = page(pg)
            H, W = im.shape[:2]
            mid = W // 2
            x0, x1 = (0, mid) if col == 0 else (mid, W)
            ys = nums(pg, col)
            if j == 0:
                near = [y for y in ys if abs(y - approx) <= win]
                if not near:
                    warn.append(f'{n}: 번호 줄을 못 찾음 (p{pg} 단{col} ~{approx})')
                    start = approx
                else:
                    start = min(near, key=lambda y: abs(y - approx))
                after = [y for y in ys if y > start + 30]
                end = (after[0] - 10) if after else H - BOTTOM
            else:
                # 이어지는 조각: 그 단 맨 위부터 첫 번호 앞까지
                start = TOP
                after = [y for y in ys if y > TOP + 30]
                end = (after[0] - 10) if after else H - BOTTOM
            pieces.append((pg, x0, x1, max(TOP, start - 10), end))
        ims = [Image.fromarray(page(p)[y0:y1, a:b]) for p, a, b, y0, y1 in pieces if y1 - y0 > 20]
        if not ims:
            warn.append(f'{n}: 잘라낼 것이 없음')
            continue
        W2 = max(i.width for i in ims)
        c = Image.new('RGB', (W2, sum(i.height for i in ims)), 'white')
        y = 0
        for i in ims:
            c.paste(i, (0, y))
            y += i.height
        c = c.crop(trim(c))
        f = f'{n:04d}.png'
        c.save(os.path.join(out, f))
        index[str(n)] = dict(file=f, page=parts[0][0])
    json.dump(index, open(os.path.join(out, 'index.json'), 'w', encoding='utf8'), ensure_ascii=False)
    print(f'잘라냄 {len(index)}/{len(spec["items"])}')
    for w in warn:
        print('  [경고]', w)


if __name__ == '__main__':
    main()
