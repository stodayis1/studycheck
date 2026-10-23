"""답지의 「정답_ …」 줄을 그림으로 잘라 둔다 (자기채점 화면에서 학생이 보는 답).

줄이 길어 다음 줄까지 이어지는 답(⑴ ⑵ 꼴, 식)이 있어 **그 줄 아래 조금까지** 함께 담는다.
"""
import io
import json
import os
import numpy as np
import pymupdf
from PIL import Image

W = 400
s = pymupdf.open('sol.pdf')
A = json.load(io.open('a_meta.json', encoding='utf8'))
os.makedirs('out/a', exist_ok=True)
n = 0
tall = 0
for k, v in A.items():
    x0, y0, x1, y1 = v['bb']
    # **그 줄 전체**를 자른다. 오른쪽으로 더 열면 옆 칸의 풀이 글이 딸려 들어오고,
    # 「정답_」 만큼 왼쪽을 잘라내면 답의 첫 글자가 잘린다 (둘 다 2026-10-23 에 겪음).
    r = pymupdf.Rect(x0 - 2, y0 - 2, max(x1 + 3, x0 + 46), y1 + 2)
    z = W / r.width
    pm = s[v['pg']].get_pixmap(matrix=pymupdf.Matrix(z, z), clip=r)
    a = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3]
    m = a.min(2) < 225
    ys = np.where(m.any(1))[0]
    xs = np.where(m.any(0))[0]
    if not len(ys):
        continue
    a = a[max(0, ys[0] - 4):ys[-1] + 5, max(0, xs[0] - 4):xs[-1] + 5]
    Image.fromarray(a).save(f'out/a/{int(k):03d}_a.png')
    n += 1
    if a.shape[0] > 60:
        tall += 1
print('정답 그림', n, '· 키 60px 넘는 것', tall)
