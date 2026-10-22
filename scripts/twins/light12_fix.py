"""라이트쎈 — 지시문이 빠진 문항을 **원본 PDF 에서 다시 잘라** 고친다.

왜 이렇게 하나
  앞서 이웃 그림에서 지시문 띠를 떼어 붙여 보려다 실패했다 (같은 문장이 두 번 나오거나
  개념 상자를 떼어 왔다). 원본 PDF 가 있으면 **지시문 줄의 자리를 직접 찾을 수 있어** 확실하다.

지시문은 어떻게 찾나
  「[0021~0024]」 는 단의 왼쪽 모서리에 선 **색 글자**이고, 문항 번호(「0022」)보다 훨씬 넓다
  (200dpi 에서 번호 ~65px, 지시문 머리 ~200px). 그 줄부터 **그 묶음의 첫 문항 바로 위**까지가
  지시문 띠다 — 보기 상자·그림이 그 안에 들어간다.
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


def colored(a):
    x = a.astype(int)
    return ((x.max(2) - x.min(2)) >= 50) & (x.min(2) < 200)


def wide_color_lines(a, x0, x1, minw=108):
    """그 단 안에서 **넓은 색 글자 줄**(묶음 지시문 머리)의 y 들"""
    m = colored(a[:, x0:x1])
    lab, n = ndimage.label(ndimage.binary_dilation(m, structure=np.ones((3, 13))))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        w = sl[1].stop - sl[1].start
        h = sl[0].stop - sl[0].start
        if w >= minw and 14 <= h <= 46 and sl[1].start <= 46:
            out.append((sl[0].start, sl[0].stop, x0 + sl[1].start, x0 + sl[1].stop))
    return sorted(out)


def trim(a, pad=8):
    ink = a.min(2) < 185
    ys = np.where(ink.any(1))[0]
    return a[max(0, ys[0] - pad):ys[-1] + pad + 1] if len(ys) else None
