import argparse
import io
import json
import os
import sys
import urllib.parse
import urllib.request

import numpy as np
import pymupdf
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'page-map'))
from match import load_env, fetch_all, grab_image, ink, api   # noqa: E402

BUCKET = 'problem-images'
DPI = 200                      # 문항 그림이 200dpi 다 — 쪽도 같은 배율로 그려야 겹친다
RIGHT_PAD = 10                 # 되찾은 오른쪽에 두는 여백
GAP = 22                       # 이만큼 비면 거기서 끊는다 (단 사이 빈 띠)
MARGIN = 26                    # 쪽 끝 여백

PDFS = {
    ('중1', 2): r'C:\Users\USER\Desktop\빅픽쳐\문제은행\중등\중1\２학기\유형서\라이트쎈\[22년개정]라이트쎈 중1－2.pdf',
    ('중2', 1): r'C:\Users\USER\Desktop\빅픽쳐\문제은행\중등\중2\１학기\유형서\라이트쎈\22개정 라이트쎈 중2-1.pdf',
    ('중2', 2): r'C:\Users\USER\Desktop\빅픽쳐\문제은행\중등\중2\２학기\유형서\라이트쎈\2022개정 중2-2 수학 라이트쎈.pdf',
    ('중3', 2): r'C:\Users\USER\문제은행\중3-2\중3-2\라이트쎈\중3-2 수학 라이트 쎈 3-2.pdf',
}


K = 4                          # 이 배수로 줄여서 먼저 찾는다 (원래 크기로만 찾으면 한 건에 1분 넘는다)


def _shrink(m, k):
    h, w = m.shape
    h2, w2 = h // k, w // k
    return m[:h2 * k, :w2 * k].reshape(h2, k, w2, k).mean(axis=(1, 3))


def locate_fast(page, tmpl):
    """줄인 그림으로 대충 찾고, 그 둘레만 원래 크기로 훑어 정확한 자리를 잡는다."""
    P, T = ink(page), ink(tmpl)
    if P.shape[0] < T.shape[0] or P.shape[1] < T.shape[1]:
        return None
    sp, st = _shrink(P, K), _shrink(T, K)
    if st.shape[0] < 3 or st.shape[1] < 3 or sp.shape[0] < st.shape[0] or sp.shape[1] < st.shape[1]:
        return None
    r = _ncc(sp, st)
    if r is None:
        return None
    y, x = np.unravel_index(np.argmax(r), r.shape)
    cx, cy = int(x) * K, int(y) * K
    th, tw = T.shape
    best = None
    for dy in range(-K, K + 1):
        for dx in range(-K, K + 1):
            yy, xx = cy + dy, cx + dx
            if yy < 0 or xx < 0 or yy + th > P.shape[0] or xx + tw > P.shape[1]:
                continue
            w = P[yy:yy + th, xx:xx + tw]
            a = w - w.mean()
            b = T - T.mean()
            d = np.linalg.norm(a) * np.linalg.norm(b)
            v = float((a * b).sum() / d) if d > 1e-6 else -1.0
            if best is None or v > best[4]:
                best = (xx, yy, int(tw), int(th), v)
    return best


def _ncc(page, tmpl):
    ph, pw = page.shape
    th, tw = tmpl.shape
    t = tmpl - tmpl.mean()
    tn = np.linalg.norm(t)
    if tn < 1e-6:
        return None
    num = fftconvolve(page, (t / tn)[::-1, ::-1], mode='valid')
    ii = np.zeros((ph + 1, pw + 1))
    ii2 = np.zeros((ph + 1, pw + 1))
    ii[1:, 1:] = np.cumsum(np.cumsum(page, 0), 1)
    ii2[1:, 1:] = np.cumsum(np.cumsum(page ** 2, 0), 1)

    def box(a):
        return a[th:, tw:] - a[:-th, tw:] - a[th:, :-tw] + a[:-th, :-tw]

    s, s2 = box(ii), box(ii2)
    den = np.sqrt(np.maximum(s2 - s * s / (th * tw), 1e-6))
    return num / den


def locate(page, tmpl):
    """문항 그림이 쪽 어디에 있는지 — 겹치는 정도가 가장 큰 자리와 그 점수."""
    P, T = ink(page), ink(tmpl)
    ph, pw = P.shape
    th, tw = T.shape
    if ph < th or pw < tw:
        return None
    t = T - T.mean()
    tn = np.linalg.norm(t)
    if tn < 1e-6:
        return None
    num = fftconvolve(P, (t / tn)[::-1, ::-1], mode='valid')
    ii = np.zeros((ph + 1, pw + 1))
    ii2 = np.zeros((ph + 1, pw + 1))
    ii[1:, 1:] = np.cumsum(np.cumsum(P, 0), 1)
    ii2[1:, 1:] = np.cumsum(np.cumsum(P ** 2, 0), 1)

    def box(a):
        return a[th:, tw:] - a[:-th, tw:] - a[th:, :-tw] + a[:-th, :-tw]

    s, s2 = box(ii), box(ii2)
    den = np.sqrt(np.maximum(s2 - s * s / (th * tw), 1e-6))
    r = num / den
    y, x = np.unravel_index(np.argmax(r), r.shape)
    return int(x), int(y), int(tw), int(th), float(r[y, x])


def right_edge(page, x0, y0, w, h):
    """문항의 진짜 오른쪽 끝.

    지금 자리에서 오른쪽으로 가다가
      · 세로로 통째로 비는 띠        → 거기가 끝 (단 사이 빈 자리)
      · 위아래로 쭉 그은 가는 세로줄  → 거기가 끝 (단 구분선. 넘어가면 옆 단이 딸려 온다)
    중 먼저 나오는 데서 끊는다.
    """
    H, W = page.shape
    band = page[max(0, y0 - 4):min(H, y0 + h + 4)] < 170
    bh = band.shape[0]
    lim = W - MARGIN
    run = 0
    x = x0 + w
    while x < lim:
        col = band[:, x]
        if not col.any():
            run += 1
            if run >= GAP:
                return x - run + RIGHT_PAD
            x += 1
            continue
        run = 0
        # 가는 세로줄인가 — 높이를 거의 다 채우고 폭이 좁으면 단 구분선이다
        if col.sum() > bh * 0.8:
            k = x
            while k < lim and band[:, k].sum() > bh * 0.5:
                k += 1
            if k - x <= 6:
                return max(x0 + w, x - 6)
            x = k
            continue
        x += 1
    return lim


def bottom_edge(page, x0, y0, w, h, newx1):
    """아래쪽도 같은 식으로 — 가로로 통째로 비는 줄에서 끊는다."""
    H, W = page.shape
    band = page[:, max(0, x0 - 4):min(W, newx1 + 4)] < 170
    lim = H - 150                       # 바닥글은 빼고
    run = 0
    for y in range(y0 + h, lim):
        if not band[y].any():
            run += 1
            if run >= 36:
                return y - run + 8
        else:
            run = 0
    return min(y0 + h, lim)


def put(path, buf):
    url = os.environ['NEXT_PUBLIC_SUPABASE_URL'] + '/storage/v1/object/' + BUCKET + '/' + urllib.parse.quote(path)
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(url, data=buf, method='POST')
    for k, v in {'apikey': key, 'Authorization': 'Bearer ' + key,
                 'Content-Type': 'image/png', 'x-upsert': 'true'}.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=120) as r:
        r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--grade', required=True)
    ap.add_argument('--sem', type=int, required=True)
    ap.add_argument('--offset', type=int, default=0, help='교재에 인쇄된 쪽 − PDF 쪽')
    ap.add_argument('--min-score', type=float, default=0.55)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--out', default=os.path.join(HERE, '_preview'))
    ap.add_argument('--hunt', action='store_true',
                    help='쪽 번호가 없거나 그 쪽에서 못 찾은 문항은 PDF 전체를 뒤진다 (느리다)')
    ap.add_argument('--with-bottom', action='store_true',
                    help='아래쪽도 넓힌다 — 다음 문항을 통째로 삼킨 적이 있어 기본은 끔')
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    load_env()

    rows = [r for r in fetch_all('/rest/v1/problems', {
        'select': 'id,local_no,page_no,image_path', 'book': 'eq.라이트쎈',
        'grade': 'eq.' + a.grade, 'semester': 'eq.%d' % a.sem})
        if r.get('image_path') and (r.get('page_no') or a.hunt)]
    rows.sort(key=lambda r: str(r['local_no']))
    print('%s-%d 문항 %d' % (a.grade, a.sem, len(rows)), flush=True)

    doc = pymupdf.open(PDFS[(a.grade, a.sem)])
    os.makedirs(a.out, exist_ok=True)
    cache = {}

    def page_arr(idx):
        if idx not in cache:
            if len(cache) > 6:
                cache.clear()
            pm = doc[idx].get_pixmap(dpi=DPI)
            cache[idx] = np.frombuffer(pm.samples, np.uint8).reshape(
                pm.height, pm.width, pm.n)[..., :3].mean(2).astype(np.float32)
        return cache[idx]

    # 먼저 '테두리를 뚫고 나간' 문항만 추린다. 그림을 한꺼번에 받아야 빠르다.
    def flag(r):
        try:
            cur = grab_image(r['image_path'])
        except Exception:
            return None
        m = np.asarray(cur, dtype=np.float32) < 175
        if not m.any():
            return None
        ri = m[:, -3:].any(1).sum() / max(m.any(1).sum(), 1)
        bo = m[-3:, :].any(0).sum() / max(m.any(0).sum(), 1)
        if ri <= 0.15 and not (a.with_bottom and bo > 0.30):
            return None
        return (r, cur, float(ri), float(bo))

    with ThreadPoolExecutor(max_workers=16) as ex:
        todo = [x for x in ex.map(flag, rows) if x]
    # 같은 쪽끼리 모아 둬야 쪽 그림을 다시 그리지 않는다
    todo.sort(key=lambda x: (x[0]['page_no'], str(x[0]['local_no'])))
    print('  손볼 문항 %d' % len(todo), flush=True)

    # --hunt 용: 줄인 쪽 그림을 한 번만 만들어 돌려 쓴다
    small_cache = []

    def smalls():
        if not small_cache:
            print('  쪽 그림 준비…', flush=True)
            for k in range(len(doc)):
                pm = doc[k].get_pixmap(dpi=DPI)
                arr = np.frombuffer(pm.samples, np.uint8).reshape(
                    pm.height, pm.width, pm.n)[..., :3].mean(2).astype(np.float32)
                small_cache.append(_shrink(ink(arr), K))
        return small_cache

    n_fix = n_skip = n_low = 0
    for r, cur, ri, bo in todo:
        t = np.asarray(cur, dtype=np.float32)
        idx = (r['page_no'] - a.offset - 1) if r.get('page_no') else -1
        pg = page_arr(idx) if 0 <= idx < len(doc) else None
        got = locate_fast(pg, t) if pg is not None else None
        if (not got or got[4] < a.min_score) and a.hunt:
            # 쪽을 모르거나 그 쪽에 없으면 PDF 를 통째로 뒤진다.
            # 쪽마다 원래 크기로 그리면 너무 느려서, **줄인 그림으로 쪽만 먼저 고른다.**
            st = _shrink(ink(t), K)
            best = (-1, -1)
            for k, sp in enumerate(smalls()):
                if sp.shape[0] < st.shape[0] or sp.shape[1] < st.shape[1]:
                    continue
                r2 = _ncc(sp, st)
                if r2 is None:
                    continue
                v = float(r2.max())
                if v > best[0]:
                    best = (v, k)
            if best[1] >= 0:
                idx = best[1]
                pg = page_arr(idx)
                got = locate_fast(pg, t)
        if not got or got[4] < a.min_score or pg is None:
            n_low += 1
            continue
        x0, y0, w, h, sc = got
        x1 = right_edge(pg, x0, y0, w, h) if ri > 0.15 else x0 + w
        # 아래쪽 넓히기는 기본으로 끈다. 문항 사이 빈 줄이 좁은 쪽에서는
        # 바로 아래 문항을 통째로 끌어와 버린다(중2-1 0378 이 0379 를 삼켰다).
        y1 = (bottom_edge(pg, x0, y0, w, h, x1)
              if (a.with_bottom and bo > 0.30) else y0 + h)
        if x1 <= x0 + w + 4 and y1 <= y0 + h + 4:
            n_skip += 1
            continue
        pm = doc[idx].get_pixmap(dpi=DPI, clip=pymupdf.Rect(
            x0 * 72 / DPI, y0 * 72 / DPI, x1 * 72 / DPI, y1 * 72 / DPI))
        new = Image.open(io.BytesIO(pm.tobytes('png'))).convert('L')
        # 지금 그림을 그대로 덮어 둔다 — 교재 원본 번호를 지운 상태가 유지된다
        new.paste(cur, (0, 0))
        # 끝에 붙은 빈 여백은 덜어낸다 (안 잘린 문항까지 괜히 넓어지지 않게)
        na = np.asarray(new) < 175
        if na.any():
            xs = np.where(na.any(0))[0]
            ys = np.where(na.any(1))[0]
            new = new.crop((0, 0, min(new.width, int(xs[-1]) + RIGHT_PAD),
                            min(new.height, int(ys[-1]) + RIGHT_PAD)))
        if new.width <= cur.width + 4 and new.height <= cur.height + 4:
            n_skip += 1
            continue
        tag = '%s-%d_%s' % (a.grade, a.sem, r['local_no'])
        if a.write:
            b = io.BytesIO(); new.save(b, format='PNG')
            put(r['image_path'], b.getvalue())
        else:
            side = Image.new('L', (cur.width + new.width + 12, max(cur.height, new.height)), 255)
            side.paste(cur, (0, 0)); side.paste(new, (cur.width + 12, 0))
            side.save(os.path.join(a.out, tag + '.png'))
        n_fix += 1
        if n_fix % 20 == 0:
            print('  %d개' % n_fix, flush=True)
        if a.limit and n_fix >= a.limit:
            break
    print('되살림 %d · 넓힐 것 없음 %d · 자리를 못 찾음 %d' % (n_fix, n_skip, n_low))
    if not a.write:
        print('미리보기: %s  (왼쪽=지금 / 오른쪽=고친 것)' % a.out)


if __name__ == '__main__':
    main()
