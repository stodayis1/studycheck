"""문항 이미지를 PDF 쪽에 맞춰 보고 **문항 → 교재 쪽**을 알아낸다.

왜 또 만드나
  run.py  : 번호가 책 전체에서 한 번만 매겨지는 교재(쎈)에서만 된다.
  run2.py : 소단원마다 번호가 1부터 다시 시작하는 교재(쎈B·베이직쎈)를 노렸지만
            번호를 그림에서 읽어야 해서 실제로는 6%밖에 못 붙였다.
  이 파일 : 번호를 아예 읽지 않는다. 문항 이미지는 그 PDF에서 잘라낸 것이므로
            **잘린 그림이 몇 쪽에 있는지 직접 찾는다.** 번호 모양·체계와 무관하다.

어떻게
  1) 쪽을 그려 좌·우 단으로 나누고, 단마다 '줄별 잉크 양'(세로 모양)을 구한다
  2) 문항 그림도 같은 방식으로 세로 모양을 구한다
  3) 문항 모양을 쪽 모양 위로 미끄러뜨리며 가장 잘 겹치는 자리를 찾는다
  4) 문항 순서와 쪽 순서는 같으므로, 직전에 찾은 쪽 근처만 본다(빠르고 덜 틀린다)

쓰는 법 (PowerShell)
  python scripts/page-map/match.py "<문제집 PDF>" 쎈B 중1 2 --offset 1
  python scripts/page-map/match.py "<문제집 PDF>" 쎈B 중1 2 --offset 1 --write

  --check  : 이미 page_no가 있는 교재(라이트쎈)에 쓰면 정답과 맞춰 정확도를 보여준다
  --offset : 교재에 인쇄된 쪽 = PDF 쪽 + offset
"""
import argparse
import io
import os
import re
import sys
import urllib.parse
import urllib.request

import numpy as np
import pymupdf
from PIL import Image
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DPI = 200
BUCKET = 'problem-images'


def load_env():
    for f in ('.env.local', '.env'):
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            continue
        for line in io.open(p, encoding='utf8'):
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())


def api(path, params=None, method='GET', data=None):
    url = os.environ['NEXT_PUBLIC_SUPABASE_URL'] + path + ('?' + urllib.parse.urlencode(params) if params else '')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in {'apikey': key, 'Authorization': 'Bearer ' + key,
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=120) as r:
        b = r.read()
    return __import__('json').loads(b) if b and method == 'GET' else None


def fetch_all(path, params):
    """Supabase는 한 번에 1000행까지만 준다 — 끝까지 가져온다."""
    STEP = 1000
    out, off = [], 0
    while True:
        q = dict(params)
        q['limit'] = STEP
        q['offset'] = off
        got = api(path, q) or []
        out.extend(got)
        if len(got) < STEP:
            return out
        off += STEP


def grab_image(path):
    url = os.environ['NEXT_PUBLIC_SUPABASE_URL'] + '/storage/v1/object/' + BUCKET + '/' + urllib.parse.quote(path)
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(req, timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert('L')


# ── 그림 맞춰보기 ────────────────────────────────────────────────────────
# 줄별 잉크 양(세로 모양)만으로는 엉뚱한 쪽에 붙는다(라이트쎈으로 재보니 6%).
# 그림을 통째로 겹쳐 보는 쪽이 훨씬 정확해서 2차원으로 맞춘다.
# 빠르게 하려고 8배로 줄인 흑백 그림을 쓴다.
SHRINK = 8


def ink(arr):
    """글자가 있는 곳을 1로. 종이 밝기 차이에 덜 흔들리게 흑백으로 바꿔 센다."""
    return (arr < 170).astype(np.float32)


def shrink(m, k=SHRINK):
    h, w = m.shape
    h2, w2 = h // k, w // k
    if h2 < 1 or w2 < 1:
        return m[:1, :1]
    return m[:h2 * k, :w2 * k].reshape(h2, k, w2, k).mean(axis=(1, 3))


def match2d(page, tmpl):
    """문항 그림을 쪽 그림 위로 미끄러뜨려 가장 잘 겹치는 점수를 돌려준다(-1~1)."""
    th, tw = tmpl.shape
    ph, pw = page.shape
    if th < 3 or tw < 3 or ph < th or pw < tw:
        return -1.0
    t = tmpl - tmpl.mean()
    tn = np.linalg.norm(t)
    if tn < 1e-6:
        return -1.0
    t /= tn
    num = fftconvolve(page, t[::-1, ::-1], mode='valid')
    # 겹친 자리마다의 밝기 합·제곱합 — 적분영상으로 한 번에 구한다
    ii = np.zeros((ph + 1, pw + 1), np.float64)
    ii2 = np.zeros((ph + 1, pw + 1), np.float64)
    ii[1:, 1:] = np.cumsum(np.cumsum(page, axis=0), axis=1)
    ii2[1:, 1:] = np.cumsum(np.cumsum(page ** 2, axis=0), axis=1)

    def box(a):
        return (a[th:, tw:] - a[:-th, tw:] - a[th:, :-tw] + a[:-th, :-tw])

    s = box(ii)
    s2 = box(ii2)
    n = th * tw
    denom = np.sqrt(np.maximum(s2 - s * s / n, 1e-6))
    return float(np.max(num / denom))


def page_columns(g):
    """쪽을 좌·우 단으로 가른다. 가운데 세로 빈칸을 찾아 자른다."""
    H, W = g.shape
    mid = W // 2
    band = (g[:, mid - W // 10: mid + W // 10] < 170).sum(axis=0)
    gutter = mid - W // 10 + int(np.argmin(band))
    return [g[:, :gutter], g[:, gutter:]]


def natural_no(s):
    m = re.search(r'\d+', str(s) or '')
    return int(m.group()) if m else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('book')
    ap.add_argument('grade')
    ap.add_argument('semester')
    ap.add_argument('--offset', type=int, default=1)
    ap.add_argument('--back', type=int, default=2, help='직전 쪽에서 뒤로 몇 쪽까지 볼지')
    ap.add_argument('--ahead', type=int, default=8, help='직전 쪽에서 앞으로 몇 쪽까지 볼지')
    ap.add_argument('--min-score', type=float, default=0.35)
    ap.add_argument('--anchor-score', type=float, default=0.55,
                    help='근처에서 이 점수에 못 미치면 책 전체를 다시 훑는다')
    ap.add_argument('--limit', type=int, default=0, help='시험 삼아 앞의 몇 문항만')
    ap.add_argument('--check', action='store_true', help='이미 있는 page_no와 맞춰 정확도 확인')
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    load_env()

    rows = fetch_all('/rest/v1/problems', {
        'select': 'id,sub_chapter_no,local_no,page_no,image_path',
        'book': 'eq.' + a.book, 'grade': 'eq.' + a.grade, 'semester': 'eq.' + a.semester})
    rows = [r for r in rows if r.get('image_path')]
    rows.sort(key=lambda r: (r.get('sub_chapter_no') or 0, natural_no(r.get('local_no'))))
    if a.limit:
        rows = rows[:a.limit]
    print(f'{a.book} {a.grade}-{a.semester}  문항 {len(rows)}개  (인쇄 쪽 = PDF 쪽 + {a.offset})', flush=True)

    doc = pymupdf.open(a.pdf)
    npages = len(doc)
    cache = {}

    def cols_of(pg):
        if pg not in cache:
            pm = doc[pg].get_pixmap(dpi=DPI)
            arr = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3]
            g = arr.mean(axis=2)
            cache[pg] = [shrink(ink(c)) for c in page_columns(g)]
            if len(cache) > 40:          # 메모리가 끝없이 불지 않게
                cache.pop(next(iter(cache)))
        return cache[pg]

    cur = 0
    first = True
    found = []
    for i, r in enumerate(rows):
        try:
            im = grab_image(r['image_path'])
        except Exception:
            found.append(None)
            continue
        t = shrink(ink(np.asarray(im, dtype=np.float32)))

        def scan(lo, hi):
            b = (-1.0, None)
            for pg in range(lo, hi + 1):
                for col in cols_of(pg):
                    sc = match2d(col, t)
                    if sc > b[0]:
                        b = (sc, pg)
            return b

        # 직전에 찾은 쪽 근처만 본다. 다만 **첫 문항**과 **확신이 낮을 때**는 책 전체를 훑는다.
        # (근처만 보면 시작 쪽을 못 찾아 처음부터 어긋나고, 한 번 어긋나면 계속 밀린다)
        best = (-1.0, None) if first else scan(max(0, cur - a.back), min(npages - 1, cur + a.ahead))
        if best[0] < a.anchor_score:
            g = scan(0, npages - 1)
            if g[0] > best[0]:
                best = g
        first = False

        if best[0] >= a.min_score and best[1] is not None:
            found.append(best[1] + a.offset)
            cur = best[1]
        else:
            found.append(None)
        if i % 50 == 0:
            ok = sum(1 for x in found if x)
            print(f'  {i}/{len(rows)}  붙임 {ok}  현재 {cur + a.offset}쪽', flush=True)

    ok = [i for i, x in enumerate(found) if x]
    print(f'  쪽을 붙일 문항 {len(ok)} / {len(rows)}')

    # 거꾸로 간 곳 (문항 순서대로면 쪽도 늘어나야 한다)
    seq = [found[i] for i in ok]
    back = sum(1 for j in range(1, len(seq)) if seq[j] < seq[j - 1])
    print(f'  쪽이 거꾸로인 곳 {back}  ← 0에 가까워야 한다')

    if a.check:
        have = [i for i in ok if rows[i].get('page_no')]
        same = sum(1 for i in have if int(rows[i]['page_no']) == found[i])
        near = sum(1 for i in have if abs(int(rows[i]['page_no']) - found[i]) <= 1)
        if have:
            print(f'  ✓ 정답과 대조: 정확히 일치 {same}/{len(have)} ({100*same//len(have)}%)'
                  f' · 1쪽 이내 {near}/{len(have)} ({100*near//len(have)}%)')
        return

    if not a.write:
        print('  (--write 를 붙여야 실제로 저장합니다)')
        return

    import json
    n = 0
    for i in ok:
        api('/rest/v1/problems', {'id': 'eq.' + str(rows[i]['id'])}, method='PATCH',
            data=json.dumps({'page_no': found[i]}).encode())
        n += 1
        if n % 100 == 0:
            print(f'  저장 {n}/{len(ok)}', flush=True)
    print(f'  ✓ 저장 {n}개')


if __name__ == '__main__':
    main()
