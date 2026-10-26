# -*- coding: utf-8 -*-
"""문제 그림이 잘못 잘렸는지 **숫자로** 재서 찾는다.
   python scripts/twins/edge_check.py <폴더> [--top N]

무엇을 재나 (가장자리 잉크만 보면 난이도 배지·단 구분선까지 걸려 쓸모가 없다)
  꼬리   : 그림 안에 큰 빈 띠가 있고 그 아래 또 글이 있으면, 그건 쪽 번호·다음 꼭지 띠가
           딸려 들어온 것이다. 빈 띠 아래 글의 높이를 「꼬리」로 센다.
  오른쪽 : 글줄의 오른쪽 끝이 테두리에 닿은 **줄의 수**. 한두 줄이면 배지,
           여러 줄이면 단 끝을 어림잡아 잘라 **글이 잘린** 것이다.
  빈그림 : 글이 거의 없는 그림 (잘못 잘려 빈 데만 담긴 것).
"""
import io, os, sys, json
import numpy as np
from PIL import Image

d = sys.argv[1]
ti = sys.argv.index('--top') if '--top' in sys.argv else -1
TOP = int(sys.argv[ti+1]) if ti > 0 else 40

rows = json.load(io.open(os.path.join(d, 'list.json'), encoding='utf8'))
info = {str(r['id']): r for r in rows}

def ink(a):
    g = a[:, :, :3].astype(int)
    return (g.max(2) < 170) | ((g.max(2) - g.min(2)) > 60)

def measure(m):
    H, W = m.shape
    rowink = m.sum(1)
    txt = rowink > 2                      # 글이 있는 줄
    # 꼬리 — 50px 넘는 빈 띠 뒤에 또 글이 있으면 그 글의 높이
    tail, gap, last = 0, 0, -1
    runs = []
    y = 0
    while y < H:
        if txt[y]:
            y0 = y
            while y < H and txt[y]: y += 1
            runs.append((y0, y))
        else:
            y += 1
    if len(runs) >= 2:
        for i in range(1, len(runs)):
            if runs[i][0] - runs[i-1][1] >= 50:
                tail = runs[-1][1] - runs[i][0]
                gap = runs[i][0] - runs[i-1][1]
                break
    # 오른쪽 — 글줄 가운데 오른쪽 끝에 닿은 줄의 수
    right_rows = int(((m[:, W-2:].sum(1) > 0) & txt).sum())
    return tail, gap, right_rows, int(txt.sum())

out = []
for fn in os.listdir(d):
    if not fn.endswith('.png'): continue
    pid = fn[:-4]
    if pid not in info: continue
    try:
        a = np.array(Image.open(os.path.join(d, fn)).convert('RGB'))
    except Exception:
        continue
    H, W = a.shape[:2]
    if H < 8 or W < 8: continue
    tail, gap, rr, txtrows = measure(ink(a))
    out.append(dict(id=int(pid), book=info[pid]['book'], no=info[pid]['local_no'],
                    code=info[pid]['type_code'], w=W, h=H,
                    tail=tail, gap=gap, rightrows=rr, txtrows=txtrows))

json.dump(out, io.open(os.path.join(d, 'edge.json'), 'w', encoding='utf8'), ensure_ascii=False)

by = {}
for r in out:
    v = by.setdefault(r['book'], dict(n=0, tail=0, right=0, blank=0))
    v['n'] += 1
    if r['tail'] >= 12: v['tail'] += 1
    if r['rightrows'] >= 4: v['right'] += 1
    if r['txtrows'] < 10: v['blank'] += 1
print(f"{'교재':<16}{'문항':>5}{'꼬리':>7}{'오른쪽잘림':>11}{'빈그림':>8}")
for b in sorted(by):
    v = by[b]
    print(f"{b:<16}{v['n']:>5}{v['tail']:>7}{v['right']:>11}{v['blank']:>8}")
print()
for key, label in (('tail', '꼬리가 붙은 것 (쪽번호·다음 꼭지 띠)'), ('rightrows', '오른쪽이 잘린 것')):
    print(label)
    for r in sorted(out, key=lambda r: -r[key])[:TOP]:
        if r[key] < (12 if key == 'tail' else 4): break
        print(f"  {r['id']:>6} {r['book']:<14} {r['no']:<7} {r['code']:<12} {r['w']}x{r['h']}  꼬리{r['tail']:>4}(빈{r['gap']:>4}) 오른쪽줄{r['rightrows']:>3}")
    print()
