"""문항 그림을 자른다.

단 가르기
  한 쪽은 좌·우 반쪽으로 나뉘고, A단계는 반쪽 안에 문항이 가로로 둘 들어가기도 한다.
  번호의 x 를 뭉쳐 단의 왼쪽 모서리를 얻고, 오른쪽 끝은 다음 단의 모서리 바로 앞으로 잡는다.

번호 자리가 단계마다 다르다
  · A : 번호가 발문과 같은 줄에 있다  → 번호만 흰색으로 덮는다 (베이직쎈과 같은 처리)
  · B·C : 번호가 혼자 한 줄  → 그 줄을 통째로 잘라낸다 (쎈과 같은 처리)
  어느 쪽이든 학습지에는 1, 2, 3… 으로 다시 번호를 매기므로 교재 번호는 남기지 않는다.

묶음 지시문
  A단계의 「[0001~0003] 다음 두 점 사이의 거리를 구하시오.」는 문항 본문이 아니라 앞머리다.
  그 범위의 문항마다 위에 붙여 주지 않으면 「A(1), B(6)」만 남아 말이 안 된다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

W_OUT = 680


def ink(a):
    return a.min(2) < 218


def inkrows(a, k=3):
    """글자가 있는 줄. k 는 한 줄에 몇 화소 이상이어야 글자로 볼지 —
    「7」처럼 가는 글자 하나만 있는 정답 그림은 k=3 이면 통째로 버려진다."""
    return ink(a).sum(1) >= k


def runs(m, gap=0):
    out = []
    s = None
    for i, v in enumerate(m):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if out and s - out[-1][1] <= gap:
                out[-1][1] = i
            else:
                out.append([s, i])
            s = None
    if s is not None:
        out.append([s, len(m)])
    return out


def trim_rows(img, k=3):
    r = runs(inkrows(img, k), gap=0)
    while len(r) > 1 and r[-1][1] - r[-1][0] < 8 and r[-1][0] - r[-2][1] > 30:
        r.pop()
    return img[r[0][0]:r[-1][1]] if r else img[:0]


def cut_end(a, x0, x1, top, nxt):
    """다음 문항 바로 앞에서 글이 실제로 끝나는 줄 — 흰 띠가 8줄 이어지는 곳"""
    seg = inkrows(a[top:nxt, x0:x1])
    k = len(seg) - 1
    skipped = 0
    while k > 0 and seg[k] and skipped < 25:
        k -= 1
        skipped += 1
    run = 0
    while k > 0:
        if not seg[k]:
            run += 1
            if run >= 8:
                return top + k + run // 2
        else:
            run = 0
        k -= 1
    return nxt - 4


def col_edges(labels, W):
    """반쪽마다 단의 왼쪽 모서리들 (가까운 x 끼리 뭉친다)"""
    ed = {}
    for side in (0, 1):
        xs = sorted(r['x0'] for r in labels if r['side'] == side)
        g = []
        for x in xs:
            if g and x - g[-1][-1] <= 40:
                g[-1].append(x)
            else:
                g.append([x])
        ed[side] = [int(np.median(v)) for v in g]
    return ed


def col_span(r, labels, W):
    """그 문항이 차지하는 가로 범위.

    **줄마다 따로 본다.** 한 쪽 안에서도 어떤 줄만 문항이 가로로 둘 들어간다
    (82쪽은 0494·0495 두 줄만 그렇고 나머지는 한 줄에 하나다).
    쪽 단위로 단을 나누면 한 줄짜리 문항의 오른쪽이 잘린다.
    """
    side = r['side']
    mate = [q['x0'] for q in labels
            if q['side'] == side and abs(q['y0'] - r['y0']) <= 30 and q['x0'] > r['x0'] + 60]
    x1 = (min(mate) - 14) if mate else ((W // 2 - 24) if side == 0 else int(W * 0.935))
    return max(0, r['x0'] - 12), min(W, x1)


def half_span(r, W):
    """반쪽 전체 폭. 묶음 지시문은 문항이 가로로 둘인 줄에서도 단 전체를 가로지른다."""
    return (max(0, r['x0'] - 12),
            (W // 2 - 24) if r['side'] == 0 else int(W * 0.935))


def white(h, w):
    return np.full((h, w, 3), 255, np.uint8)


def fit(parts, W=W_OUT):
    out = []
    for p in parts:
        if p.shape[1] > W:
            im = Image.fromarray(p)
            f = W / p.shape[1]
            p = np.array(im.resize((W, max(1, int(p.shape[0] * f))), Image.LANCZOS))
        elif p.shape[1] < W:
            p = np.hstack([p, white(p.shape[0], W - p.shape[1])])
        out.append(p)
    return np.vstack(out) if out else white(1, W)


def ext_top(a, r, x0, x1, nb, reach=72):
    """번호 줄 위로 삐져나온 수식을 살린다.

    분수·행렬·근호는 글줄보다 키가 커서 번호와 같은 높이까지 올라온다.
    번호 줄을 그냥 잘라 내면 분자가 날아간다 (1194번 사례).
    번호 옆의 난이도 딱지·서술형 딱지는 **색이 있으므로** 빼고, 검은 글자만 본다.
    """
    top0 = max(0, nb - reach)
    sub = a[top0:nb, x0:x1].astype(int)
    mx = sub.max(2)
    mn = sub.min(2)
    bw = ((mx - mn) < 45) & (mn < 200)          # 색기 없는 어두운 화소 = 검은 글자
    ia, ib = max(0, r['x0'] - x0 - 4), min(bw.shape[1], r['x1'] - x0 + 8)
    bw[:, ia:ib] = False                         # 번호 자리는 본다 쳐도 소용없다
    rows = bw.sum(1) >= 3
    k = len(rows) - 1
    while k >= 0 and rows[k]:
        k -= 1
    return top0 + k + 1 if k < len(rows) - 1 else nb


def clean_above(img, h):
    """번호 줄을 살려 올린 구간에서 **아래와 이어지지 않은 것**을 지운다.

    살리고 싶은 것은 분수·행렬·근호처럼 키가 커서 번호 높이까지 올라온 수식이고,
    그런 것은 분모·가로줄이 아래에 있어 본문과 **이어져 있다.**
    반대로 교재 번호, 난이도 딱지, 서술형 딱지, 「177쪽 유형 15」 참조는
    그 줄 안에서 끝난다 — 색으로 가리려 했더니 스캔마다 색이 흐려 빗나갔다.
    """
    if h <= 0 or h >= img.shape[0]:
        return img
    m = ndimage.binary_dilation(ink(img), structure=np.ones((3, 5)))
    lab, n = ndimage.label(m)
    keep = set(np.unique(lab[h:]))
    keep.discard(0)
    out = img.copy()
    band = out[:h]
    band[~np.isin(lab[:h], list(keep))] = 255
    return out
