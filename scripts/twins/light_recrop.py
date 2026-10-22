"""라이트쎈 — 자르기가 망가진 문항을 원본 PDF 에서 다시 자른다.

왜 망가졌나
  번호 검출이 엉뚱한 글자를 번호로 잡아 **x 좌표가 딴 데**를 가리켰다
  (0392 는 678 인데 같은 반쪽의 다른 문항은 827). 그래서 상자 모서리 조각만 잘렸다.

어떻게 고치나
  같은 쪽·같은 반쪽에 있는 **다른 문항들의 x**(중앙값)를 그 단의 왼쪽 모서리로 보고 다시 자른다.
  세로는 다음 문항 바로 위까지 — 원래 크롭과 같이 **가장 긴 흰 띠**에서 끊는다.
"""
import io
import json
import os
import sys
import numpy as np
import pymupdf
from PIL import Image

DPI = 200
TOP, BOT = 130, 2210


def page(doc, pi):
    pm = doc[pi].get_pixmap(dpi=DPI)
    return np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].copy()


def cut_at_gap(g, x0, x1, ytop, ybot, gap=62):
    band = (g[ytop:ybot, x0:x1] < 170)
    rr = band.sum(1)
    W = x1 - x0
    run = 0
    start = None
    for i, v in enumerate(rr):
        if i < 60:
            continue
        if v <= 0.004 * W:
            if run == 0:
                start = i
            run += 1
            if run >= gap:
                return ytop + start
        else:
            run = 0
    return ybot


def trim(a, pad=8):
    ys = np.where((a.min(2) < 175).any(1))[0]
    return a[max(0, ys[0] - pad):ys[-1] + pad + 1] if len(ys) else None


def recrop(doc, rows, no, cache):
    by = {r['no']: r for r in rows}
    r = by[no]
    if r['pg'] not in cache:
        cache[r['pg']] = page(doc, r['pg'])
    a = cache[r['pg']]
    W = a.shape[1]
    same = [q for q in rows if q['pg'] == r['pg'] and q['half'] == r['half'] and q['no'] != no]
    if not same:
        return None, '같은 반쪽에 견줄 문항이 없음'
    cx0 = max(30, int(np.median([q['x0'] for q in same])) - 14)
    cx1 = (W // 2 - 20) if r['half'] == 0 else W - 34
    nxt = [q['y0'] for q in same if q['y0'] > r['y0'] + 25]
    cy0 = max(TOP, r['y0'] - 10)
    cy1 = min(min(nxt) - 12 if nxt else BOT, BOT)
    cy1 = cut_at_gap(a.mean(2), cx0, cx1, cy0, cy1)
    out = trim(a[cy0:cy1, cx0:cx1])
    if out is None or out.shape[0] < 40:
        return None, '잘라 보니 비었음'
    return out, f'x{cx0}~{cx1} y{cy0}~{cy1}'
