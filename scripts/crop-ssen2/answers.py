"""빠른정답에서 문항별 정답 그림을 잘라낸다.

한 줄에 넷씩 들어가지만 정답이 길면(식·분수) 두 칸을 차지해 줄마다 개수가 다르다.
그래서 오른쪽 끝은 「같은 줄의 다음 번호」로 잡고, 없으면 그 단의 끝까지 간다.
위아래는 **줄 사이 전체**를 쓴다 — 분수·행렬은 번호보다 위아래로 넘친다.
"""
import json
import io
import os
import sys
import numpy as np
from PIL import Image
import s2det
from qklabels import labels
from cut import trim_rows, ink

HERE = os.path.dirname(os.path.abspath(__file__))


def crop(outdir, pdf='quick2.pdf'):
    rows = json.load(io.open(os.path.join(HERE, 'qklab.json'), encoding='utf8'))
    typ = json.load(io.open(os.path.join(HERE, 'qtype.json'), encoding='utf8'))
    os.makedirs(outdir, exist_ok=True)
    byp = {}
    for r in rows:
        byp.setdefault(r['pg'], []).append(r)
    made = 0
    thin = []
    for pg in sorted(byp):
        a = s2det.page(pdf, pg)
        H, W = a.shape[:2]
        mid = W // 2
        rs = byp[pg]
        for half in (0, 1):
            side = [r for r in rs if (r['x0'] < mid) == (half == 0)]
            if not side:
                continue
            # 줄로 묶는다
            lines = []
            for r in sorted(side, key=lambda q: q['y0']):
                if lines and r['y0'] - lines[-1][0]['y0'] < 14:
                    lines[-1].append(r)
                else:
                    lines.append([r])
            tops = [min(q['y0'] for q in L) for L in lines]
            for k, L in enumerate(lines):
                y0 = tops[k] - 8
                # 다음 줄 글자가 조금이라도 딸려 들어오면 엉뚱한 정답이 섞인다
                y1 = (tops[k + 1] - 12) if k + 1 < len(tops) else min(H - 4, tops[k] + 70)
                L = sorted(L, key=lambda q: q['x0'])
                for j, r in enumerate(L):
                    x1 = (L[j + 1]['x0'] - 10) if j + 1 < len(L) else \
                         ((mid - 10) if half == 0 else int(W * 0.96))
                    # 「0363 7」처럼 정답이 번호에 바짝 붙는 자리가 있다 →
                    # 비면 조금 더 왼쪽부터 다시 본다
                    sub = None
                    for pad in (1, -4, -9):
                        t = trim_rows(a[max(0, y0):y1, r['x1'] + pad:x1], k=1)
                        if t.shape[0] >= 6 and ink(t).any():
                            sub = t
                            break
                    if sub is None:
                        thin.append(r['N'])
                        continue
                    # 바짝 붙은 자리를 왼쪽으로 더 열어 본 탓에 번호 꼬리가 들어올 수 있다.
                    # 번호는 색이 있고 정답은 검으므로, 왼쪽 끝의 색 있는 화소만 지운다.
                    lw = min(14, sub.shape[1])
                    e = sub[:, :lw].astype(int)
                    sub[:, :lw][(e.max(2) - e.min(2)) >= 45] = 255
                    sub = trim_rows(sub, k=1)
                    if sub.shape[0] < 6 or not ink(sub).any():
                        thin.append(r['N'])
                        continue
                    d = os.path.join(outdir, '%02d' % int(typ[str(r['N'])].split('-')[1]))
                    os.makedirs(d, exist_ok=True)
                    Image.fromarray(sub).save(os.path.join(d, '%04d.png' % r['N']))
                    made += 1
    print(f'정답 그림 {made}개 · 빈 것 {len(thin)}', thin[:15])
    return made


if __name__ == '__main__':
    crop(sys.argv[1] if len(sys.argv) > 1 else 'ans')
