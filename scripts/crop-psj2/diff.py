"""풍산자 — 번호 옆의 「상중하」 배지에서 난이도를 읽는다.

세 칸 중 하나가 갈색으로 칠해져 있다. 칠해진 칸이 왼쪽이면 상, 가운데면 중, 오른쪽이면 하.
칠해진 화소를 모아 **배지 안에서의 가로 위치**로 가른다.
"""
import io
import json
import glob
import os
import numpy as np
from PIL import Image

LEV = ['상', '중', '하']


def read(path):
    a = np.array(Image.open(path).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fill = (r > 150) & (r < 215) & (g > 100) & (g < 175) & (b > 80) & (b < 155) & (r - b > 35)
    if fill.sum() < 150:
        return None, 0
    xs = np.where(fill.any(0))[0]
    ys = np.where(fill.any(1))[0]
    # 배지 테두리(검은 둥근 사각형)로 전체 폭을 잡는다
    dark = a.min(2) < 120
    dxs = np.where(dark.any(0))[0]
    if len(dxs) < 10:
        return None, 0
    x0, x1 = dxs[0], dxs[-1]
    c = (xs[0] + xs[-1]) / 2
    t = (c - x0) / max(1, x1 - x0)
    k = 0 if t < 1 / 3 else (1 if t < 2 / 3 else 2)
    margin = min(abs(t - 1 / 3), abs(t - 2 / 3))
    return LEV[k], round(float(margin), 3)


if __name__ == '__main__':
    out = {}
    low = []
    for f in sorted(glob.glob('out/band/*.png')):
        n = int(os.path.basename(f)[:3])
        d, m = read(f)
        out[n] = d
        if d is None or m < 0.06:
            low.append((n, d, m))
    json.dump({str(k): v for k, v in out.items()},
              io.open('diff.json', 'w', encoding='utf8'), ensure_ascii=False)
    from collections import Counter
    print('난이도', dict(Counter(out.values())))
    print('애매한 것', len(low), low[:12])
