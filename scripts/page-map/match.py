"""문항 그림을 교재 PDF에 맞춰 보고 **문항 → 교재 쪽**을 알아낸다.

왜 또 만드나
  run.py  : 번호가 책 전체에서 한 번만 매겨지는 교재(쎈)에서만 된다.
  run2.py : 소단원마다 번호가 1부터 다시 시작하는 교재(쎈B·베이직쎈)를 노렸지만
            번호를 그림에서 읽어야 해서 실제로는 6%밖에 못 붙였다.
  이 파일 : **번호를 아예 읽지 않는다.** 문항 그림은 그 PDF에서 잘라낸 것이므로
            책 어딘가에 똑같은 모양이 반드시 있다 → 그 자리를 찾는다.
            번호 체계·글꼴과 무관해서 어떤 교재에도 쓸 수 있다.

어떻게
  1) 쪽을 그림으로 바꿔 좌·우 단으로 나눈다 (한 번만 만들어 두고 계속 쓴다)
  2) 문항 그림을 각 단 위로 미끄러뜨리며 겹치는 정도를 점수로 잰다
  3) 책 순서와 쪽 순서는 같다 — 그래서 **쪽이 뒤로만 가는 조합** 중
     점수 합이 가장 큰 것을 통째로 고른다(정렬 알고리즘).
     한 문항을 잘못 짚어도 전체가 밀리지 않는다.

  예전 판은 "직전 쪽 근처만 보기"로 했다가 한 번 어긋나면 끝까지 밀렸다.
  (라이트쎈으로 재보니 정확히 맞춘 게 9%뿐이었다)

쓰는 법 (PowerShell)
  python scripts/page-map/match.py "<문제집 PDF>" 쎈B 중1 2 --offset 1
  python scripts/page-map/match.py "<문제집 PDF>" 쎈B 중1 2 --offset 1 --write

  --check  : 이미 page_no가 있는 교재(라이트쎈)에 쓰면 정답과 맞춰 정확도를 보여 준다
  --offset : 교재에 인쇄된 쪽 = PDF 쪽 + offset
"""
import argparse
import io
import json
import os
import re
import urllib.parse
import urllib.request

import numpy as np
import pymupdf
from PIL import Image
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
# 문항 그림은 200dpi로 잘라 올렸다. 쪽도 **같은 200dpi**로 그려야 크기가 맞는다.
# 150dpi로 그렸더니 1.33배 어긋나 점수가 0.59 → 0.33으로 떨어지고 전혀 못 맞혔다.
DPI = 200
SHRINK = 6          # 이 배수로 줄여서 비교한다 (작을수록 정확하고 느리다)
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
    return json.loads(b) if b and method == 'GET' else None


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


# ── 그림 다루기 ──────────────────────────────────────────────────────────
def ink(arr):
    """글자가 있는 곳을 1로. 종이 밝기 차이에 덜 흔들리게 흑백으로 바꿔 센다."""
    return (arr < 170).astype(np.float32)


def shrink(m, k=None):
    # 기본값을 함수 정의 때 묶어 두면 --shrink 를 줘도 안 먹는다 → 부를 때 읽는다
    k = k or SHRINK
    h, w = m.shape
    h2, w2 = h // k, w // k
    if h2 < 1 or w2 < 1:
        return m[:1, :1]
    return m[:h2 * k, :w2 * k].reshape(h2, k, w2, k).mean(axis=(1, 3))


def match_score(page, tmpl):
    """문항 그림을 쪽 그림 위로 미끄러뜨려 가장 잘 겹치는 점수(-1~1)."""
    th, tw = tmpl.shape
    ph, pw = page.shape
    if th < 3 or tw < 3 or ph < th or pw < tw:
        return -1.0
    t = tmpl - tmpl.mean()
    tn = np.linalg.norm(t)
    if tn < 1e-6:
        return -1.0
    t = t / tn
    num = fftconvolve(page, t[::-1, ::-1], mode='valid')
    ii = np.zeros((ph + 1, pw + 1), np.float64)
    ii2 = np.zeros((ph + 1, pw + 1), np.float64)
    ii[1:, 1:] = np.cumsum(np.cumsum(page, axis=0), axis=1)
    ii2[1:, 1:] = np.cumsum(np.cumsum(page ** 2, axis=0), axis=1)

    def box(a):
        return a[th:, tw:] - a[:-th, tw:] - a[th:, :-tw] + a[:-th, :-tw]

    s, s2 = box(ii), box(ii2)
    n = th * tw
    denom = np.sqrt(np.maximum(s2 - s * s / n, 1e-6))
    return float(np.max(num / denom))


def page_columns(g):
    """쪽을 좌·우 단으로 가른다. 글자가 전혀 없는 가운데 빈 띠를 경계로 쓴다."""
    H, W = g.shape
    band = (g[:, int(W * 0.35):int(W * 0.65)] < 170).sum(axis=0)
    gut = int(W * 0.35) + int(np.argmin(band))
    return [g[:, :gut], g[:, gut:]]


def order_key(s):
    """문항번호를 **책 순서대로** 세우는 열쇠.

    베이직쎈은 번호가 a1·a2…a14·b1… 처럼 글자+숫자다. 숫자만 보면 a1과 b1이
    같은 자리로 취급돼 책 순서가 뒤섞이고, 그러면 맞춰보기가 통째로 어긋난다
    (중1-1이 56%, 중1-2가 47%밖에 안 붙었던 이유).
    """
    t = str(s or '')
    m = re.match(r'\s*([A-Za-z]*)\s*(\d+)', t)
    if not m:
        return ('', 0, t)
    return (m.group(1).lower(), int(m.group(2)), t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('book')
    ap.add_argument('grade')
    ap.add_argument('semester')
    ap.add_argument('--offset', type=int, default=1)
    ap.add_argument('--min-score', type=float, default=0.30)
    ap.add_argument('--shrink', type=int, default=SHRINK, help='줄이는 배수 (작을수록 정확하고 느리다)')
    ap.add_argument('--limit', type=int, default=0, help='시험 삼아 앞의 몇 문항만')
    ap.add_argument('--check', action='store_true', help='이미 있는 page_no와 맞춰 정확도 확인')
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    globals()['SHRINK'] = a.shrink
    load_env()

    rows = fetch_all('/rest/v1/problems', {
        'select': 'id,sub_chapter_no,local_no,page_no,image_path',
        'book': 'eq.' + a.book, 'grade': 'eq.' + a.grade, 'semester': 'eq.' + a.semester})
    rows = [r for r in rows if r.get('image_path')]
    rows.sort(key=lambda r: (r.get('sub_chapter_no') or 0, order_key(r.get('local_no'))))
    if a.limit:
        rows = rows[:a.limit]

    doc = pymupdf.open(a.pdf)
    P = len(doc)
    print('%s %s-%s · 문항 %d · 쪽 %d' % (a.book, a.grade, a.semester, len(rows), P), flush=True)

    # 쪽 그림은 **한 번만** 만들어 둔다 (예전 판은 볼 때마다 다시 그려서 느렸다)
    print('  쪽 그림 준비…', flush=True)
    pages = []
    for i in range(P):
        pm = doc[i].get_pixmap(dpi=DPI)
        arr = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].mean(axis=2)
        pages.append([shrink(ink(c)) for c in page_columns(arr)])

    # 문항마다 모든 쪽 점수를 낸다
    S = np.full((len(rows), P), -1.0, dtype=np.float32)
    for i, r in enumerate(rows):
        try:
            im = grab_image(r['image_path'])
        except Exception:
            continue
        t = shrink(ink(np.asarray(im, dtype=np.float32)))
        for p in range(P):
            S[i, p] = max(match_score(c, t) for c in pages[p])
        if i % 25 == 0:
            print('    %d/%d' % (i, len(rows)), flush=True)

    # 쪽이 뒤로만 가는 조합 중 점수 합이 가장 큰 것을 고른다.
    # 한 문항을 잘못 짚어도 나머지가 끌어 주므로 전체가 밀리지 않는다.
    N = len(rows)
    dp = np.full((N, P), -1e9, dtype=np.float64)
    bk = np.zeros((N, P), dtype=np.int32)
    dp[0] = S[0]
    for i in range(1, N):
        best, arg = -1e9, 0
        for p in range(P):
            if dp[i - 1, p] > best:
                best, arg = dp[i - 1, p], p
            dp[i, p] = best + S[i, p]
            bk[i, p] = arg
    p = int(np.argmax(dp[N - 1]))
    assign = [0] * N
    for i in range(N - 1, -1, -1):
        assign[i] = p
        p = int(bk[i, p])

    found = [(assign[i] + a.offset) if S[i, assign[i]] >= a.min_score else None for i in range(N)]
    ok = [i for i, x in enumerate(found) if x]
    print('  쪽을 붙일 문항 %d / %d' % (len(ok), N))
    seq = [found[i] for i in ok]
    print('  쪽이 거꾸로인 곳 %d  ← 0이어야 한다'
          % sum(1 for j in range(1, len(seq)) if seq[j] < seq[j - 1]))

    if a.check:
        have = [i for i in ok if rows[i].get('page_no')]
        if have:
            same = sum(1 for i in have if int(rows[i]['page_no']) == found[i])
            near = sum(1 for i in have if abs(int(rows[i]['page_no']) - found[i]) <= 1)
            print('  ✓ 정답과 대조: 일치 %d/%d (%d%%) · 1쪽 이내 %d/%d (%d%%)'
                  % (same, len(have), 100 * same // len(have), near, len(have), 100 * near // len(have)))
        return

    if not a.write:
        print('  (--write 를 붙여야 실제로 저장합니다)')
        return

    n = 0
    for i in ok:
        api('/rest/v1/problems', {'id': 'eq.' + str(rows[i]['id'])}, method='PATCH',
            data=json.dumps({'page_no': found[i]}).encode())
        n += 1
        if n % 100 == 0:
            print('    저장 %d/%d' % (n, len(ok)), flush=True)
    print('  ✓ 저장 %d개' % n)


if __name__ == '__main__':
    main()
