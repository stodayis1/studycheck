"""번호 옆의 난이도 딱지와 서술형 딱지를 읽는다.

난이도는 동그라미 세 개로 표시한다 — 「하●●」 「●중●」 「●●상」.
글자가 든 동그라미가 칠해져 있고 나머지 둘은 작은 점이다.
→ 번호 오른쪽의 표시들을 x 순으로 세워 **가장 큰 것이 몇 번째인지**로 가른다.
서술형은 금색 딱지라 색조(hue 25~45)로 가린다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

LEVELS = ['하', '중', '상']


def read_marks(a, r, x1):
    """(난이도, 서술형여부) — 난이도를 못 읽으면 None"""
    band = a[max(0, r['y0'] - 8):r['y1'] + 8, r['x1'] + 2:x1]
    if band.size == 0:
        return None, False
    hsv = np.array(Image.fromarray(band).convert('HSV')).astype(int)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    sat = (S > 60) & (V > 60)
    essay = bool(((H >= 25) & (H <= 48) & sat).sum() > 120)   # 금색 서술형 딱지
    lab, n = ndimage.label(ndimage.binary_dilation(sat & ~((H >= 25) & (H <= 48)),
                                                   structure=np.ones((3, 3))))
    blobs = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        sz = int((lab[sl] == i + 1).sum())
        w = sl[1].stop - sl[1].start
        h = sl[0].stop - sl[0].start
        if sz < 12 or w > 40 or h > 40:
            continue
        blobs.append((sl[1].start, sz))
    blobs.sort()
    if len(blobs) < 3:
        return None, essay
    big = max(range(len(blobs[:3])), key=lambda k: blobs[k][1])
    return LEVELS[big], essay
