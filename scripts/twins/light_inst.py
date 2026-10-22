"""라이트쎈 — 지시문이 빠진 문항에 **같은 묶음 이웃의 지시문**을 붙인다.

왜
  라이트쎈 A단계는 「다음 분수를 소수로 나타내고 …」 같은 묶음 지시문 아래에
  문항이 여러 개 달린다. 자를 때 지시문을 같은 칸에서만 찾은 탓에
  **같은 줄의 오른쪽 칸 문항은 지시문을 못 받았다** (0007·0009·0011).
  학생이 「5/6」만 보고는 뭘 하라는지 알 수 없다.

어떻게
  같은 유형 안에서 번호가 가까우면서 지시문이 붙은 이웃을 둘 찾아,
  두 그림의 **위쪽에서 똑같이 겹치는 줄**을 지시문으로 본다 (문항 내용은 서로 다르므로
  겹치는 부분이 곧 지시문이다). 하나뿐이면 위쪽 가장 큰 흰 띠에서 끊는다.
  → 지어내지 않고 **같은 책·같은 묶음의 출판사 문구**를 그대로 쓴다.
"""
import numpy as np
from PIL import Image


def ink_rows(a, k=2):
    return (a.min(2) < 218).sum(1) >= k


def common_top(a, b, frac=0.004):
    """두 그림의 위쪽에서 같은 줄이 몇 줄까지 이어지는지.

    평균 차이로 재면 안 된다 — 분수처럼 획이 가는 글자는 줄 전체 평균으로는 티가 안 나서
    이웃의 **문항까지 「같다」고** 넘어간다. 다른 화소의 **개수**로 센다.
    """
    w = min(a.shape[1], b.shape[1])
    n = min(a.shape[0], b.shape[0])
    A = a[:n, :w].astype(int)
    B = b[:n, :w].astype(int)
    diff = (np.abs(A - B).max(2) > 40).mean(1)
    same = 0
    for y in range(n):
        if diff[y] > frac:
            break
        same = y + 1
    return same


def gap_split(a, upto=0.55):
    """위쪽 영역에서 가장 긴 흰 띠의 가운데 — 지시문과 문항의 경계"""
    rows = ink_rows(a)
    lim = int(len(rows) * upto)
    best = (0, None)
    run = 0
    for y in range(lim):
        if not rows[y]:
            run += 1
            if run > best[0]:
                best = (run, y)
        else:
            run = 0
    if best[1] is None or best[0] < 6:
        return None
    return best[1] - best[0] // 2


def instruction_band(imgs):
    """지시문 띠를 돌려준다 (못 찾으면 None)"""
    if len(imgs) >= 2:
        n = common_top(imgs[0], imgs[1])
        if n >= 20:
            band = imgs[0][:n]
            # 겹치는 구간 안에서도 **첫 글 덩어리(지시문)까지만** 쓴다
            r = ink_rows(band)
            if r.any():
                ys = np.where(r)[0]
                end = ys[0]
                for y in ys[1:]:
                    if y - end > 14:        # 흰 띠가 14줄 넘으면 거기서 지시문이 끝난 것
                        break
                    end = y
                return band[: end + 6]
    cut = gap_split(imgs[0])
    if cut and cut >= 20:
        return imgs[0][:cut]
    return None


def attach(band, a, pad=12):
    w = max(band.shape[1], a.shape[1])
    def wide(z):
        if z.shape[1] == w:
            return z
        return np.hstack([z, np.full((z.shape[0], w - z.shape[1], 3), 255, np.uint8)])
    return np.vstack([wide(band), np.full((pad, w, 3), 255, np.uint8), wide(a)])


def first_block(a, gap=14):
    """맨 위 글 덩어리의 (윗줄, 아랫줄)"""
    r = ink_rows(a)
    ys = np.where(r)[0]
    if not len(ys):
        return None
    end = ys[0]
    for y in ys[1:]:
        if y - end > gap:
            break
        end = y
    return ys[0], end + 1


def block_shape(a):
    """맨 위 글 덩어리를 잉크 테두리에 맞춰 잘라 작은 흑백으로 (칸이 달라도 비교되게)"""
    fb = first_block(a)
    if fb is None:
        return None
    blk = a[fb[0]:fb[1]]
    m = blk.min(2) < 218
    cols = np.where(m.any(0))[0]
    rows = np.where(m.any(1))[0]
    if not len(cols) or not len(rows):
        return None
    cut = m[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    v = np.asarray(Image.fromarray((cut * 255).astype(np.uint8)).resize((160, 26), Image.BILINEAR), float).ravel()
    v -= v.mean()
    n = np.linalg.norm(v)
    return (v / n if n else v), (cols[-1] - cols[0]), (rows[-1] - rows[0])


def same_instruction(a, b, thr=0.80):
    """두 그림의 맨 위 글 덩어리가 같은 문장인가 — **칸이 달라도** 알아보게 내용으로 견준다"""
    x, y = block_shape(a), block_shape(b)
    if x is None or y is None:
        return False
    if min(x[1], y[1]) == 0 or abs(x[1] - y[1]) / max(x[1], y[1]) > 0.2:
        return False
    return float(x[0] @ y[0]) >= thr
