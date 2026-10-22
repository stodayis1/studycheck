"""대표문제 번호 — 갈색 상자 위 흰 글자만 떼어낸다.

다른 번호는 흰 바탕에 색 글자라 어둡기로 가려내지만, 대표문제만 반대다.
상자 안에서 「밝고 색기 없는」 화소를 모으면 숫자 넉 자와 「대표 문제」 한글이 같이 잡히는데,
숫자는 상자 높이의 3분의 2를 차지하고 한글은 절반이 안 된다 — 키로 갈라낸다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage


def repmask(sub):
    H = sub.shape[0]
    hsv = np.array(Image.fromarray(sub).convert('HSV')).astype(int)
    L = (sub.astype(int) @ [299, 587, 114]) // 1000
    white = (L > 175) & (hsv[..., 1] < 90)
    lab, n = ndimage.label(white)
    keep = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        sz = (lab[sl] == i + 1).sum()
        hh = sl[0].stop - sl[0].start
        ww = sl[1].stop - sl[1].start
        if sz < 60 or hh < H * 0.5 or ww > H:   # 한글·상자테두리 걸러내기
            continue
        keep.append((sl[1].start, i + 1, sl))
    keep.sort()
    if not keep:
        return None
    # 숫자끼리는 바짝 붙고, 그 뒤 「대표 문제」 한글과는 멀찍이 떨어진다.
    # 넉 자가 서로 붙어 세 덩어리로 잡히는 일이 있으므로 개수로 끊지 않고 **틈으로** 끊는다.
    grp = [keep[0]]
    for k in keep[1:]:
        if k[0] - grp[-1][2][1].stop > 20:
            break
        grp.append(k)
    keep = grp
    m = np.zeros(sub.shape[:2], bool)
    for _, idx, sl in keep:
        m[sl] |= (lab[sl] == idx)
    return m
