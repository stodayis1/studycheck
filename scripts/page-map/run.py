"""시중교재 PDF에서 **문항번호 → 교재 쪽**을 읽어 problems.page_no 를 채운다.

왜 필요한가
  「문항 직접 고르기」 화면(= 학습지출제 → 시중교재 → 문항 직접 고르기)에서 교재를 펴듯
  쪽으로 문항을 고르려면 문항마다 '교재 몇 쪽'인지가 있어야 한다.
  예전에 잘라 올린 교재들은 그 정보가 없어서 이 도구로 뒤늦게 채운다.

어떤 교재에 쓸 수 있나
  **번호가 책 전체에서 한 번만 매겨지는 교재**(쎈 계열: 0001, 0002 … ).
  쎈B·베이직쎈처럼 소단원마다 번호가 1부터 다시 시작하는 교재는 이 방법으로 안 된다.

쓰는 법 (PowerShell)
  python scripts/page-map/run.py "<문제집 PDF>" 쎈 중2 1 --offset 1
  python scripts/page-map/run.py "<문제집 PDF>" 쎈 중2 1 --offset 1 --write   # 실제로 DB에 넣는다

  --offset : 교재에 인쇄된 쪽 = PDF 쪽 + offset  (책 아래 쪽번호를 한 번 보고 정한다)
  --write  : 없으면 읽기만 하고 결과만 보여 준다
"""
import argparse
import bisect
import collections
import io
import json
import os
import sys
import urllib.parse
import urllib.request

import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GW, GH = 14, 20
DPI = 200


# ── 그림에서 번호 찾기 ─────────────────────────────────────────
def color_mask(im):
    """교재 번호는 색 글자다. 스캔이 흐려 속이 회색인 책도 있어서
    색이 있는 곳을 부풀린 뒤 어두운 화소와 겹치는 부분을 글자로 본다."""
    mx = im.max(2); mn = im.min(2)
    col = ((mx - mn) > 22) & (mx < 250) & (mn < 215)
    seed = ndimage.binary_dilation(col, np.ones((3, 3), bool), iterations=2)
    return seed & (im.mean(2) < 195)


def groups(m):
    lab, _ = ndimage.label(m)
    bx = []
    for sl in ndimage.find_objects(lab):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if 14 <= h <= 34 and 3 <= w <= 80:
            bx.append((sl[1].start, sl[1].stop, sl[0].start, sl[0].stop))
    bx.sort(key=lambda b: (b[2], b[0]))
    rows = []; base = None; r = -1
    for b in bx:
        if base is None or b[2] - base > 12: r += 1; base = b[2]
        rows.append((r, b))
    bx = [b for _, b in sorted(rows, key=lambda rb: (rb[0], rb[1][0]))]
    res = []; cur = []
    for b in bx:
        if cur and -3 <= b[0] - cur[-1][1] <= 13 and abs(b[2] - cur[-1][2]) < 9: cur.append(b)
        else:
            if cur: res.append(cur)
            cur = [b]
    if cur: res.append(cur)
    out = []
    for g in res:
        w = g[-1][1] - g[0][0]; h = max(b[3] for b in g) - min(b[2] for b in g)
        if 40 <= w <= 95 and 18 <= h <= 34 and len(g) >= 3: out.append(g)
    return out


def split4(m, g):
    x0, x1 = g[0][0], g[-1][1]
    y0 = min(b[2] for b in g); y1 = max(b[3] for b in g)
    sub = m[y0:y1, x0:x1]
    lab, _ = ndimage.label(sub)
    comps = sorted([[sl[1].start, sl[1].stop] for sl in ndimage.find_objects(lab)
                    if sl[1].stop - sl[1].start >= 3 and sl[0].stop - sl[0].start >= 9])
    while len(comps) > 4:
        i = min(range(len(comps) - 1), key=lambda k: comps[k + 1][0] - comps[k][1])
        comps[i:i + 2] = [[comps[i][0], comps[i + 1][1]]]
    while len(comps) < 4 and comps:
        i = max(range(len(comps)), key=lambda k: comps[k][1] - comps[k][0])
        a, z = comps[i]
        if z - a < 18: break
        comps[i:i + 1] = [[a, (a + z) // 2], [(a + z) // 2, z]]; comps.sort()
    out = []
    for a, z in comps[:4]:
        p = sub[:, a:z]
        ys = np.where(p.any(1))[0]; xs = np.where(p.any(0))[0]
        if not len(ys): out.append(np.zeros(GW * GH)); continue
        q = (p[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1] * 255).astype(np.uint8)
        h0, w0 = q.shape
        nw = max(1, min(GW, int(round(w0 * GH / h0))))
        c = Image.new('L', (GW, GH), 0)
        c.paste(Image.fromarray(q).resize((nw, GH), Image.BILINEAR), ((GW - nw) // 2, 0))
        v = np.asarray(c, float).ravel(); v -= v.mean(); v /= (np.linalg.norm(v) or 1)
        out.append(v)
    while len(out) < 4: out.append(np.zeros(GW * GH))
    return out


def scan(pdf):
    d = pymupdf.open(pdf)
    rows = []; gl = []
    for i in range(len(d)):
        pm = d[i].get_pixmap(dpi=DPI)
        im = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].astype(int)
        m = color_mask(im); W = im.shape[1]
        for g in groups(m):
            rows.append(dict(pg=i, x0=int(g[0][0]), y0=int(min(b[2] for b in g)),
                             half=0 if g[0][0] < W // 2 else 1))
            gl.append(split4(m, g))
        if i % 30 == 0: print(f'  쪽 {i}/{len(d)} 누적 {len(rows)}', flush=True)
    return rows, np.array(gl)


# ── 번호 읽기 ──────────────────────────────────────────────────
def lis_assign(dec, sc, thr, hi):
    idx = [i for i in range(len(dec)) if dec[i].isdigit() and 1 <= int(dec[i]) <= hi and sc[i] >= thr]
    vals = [int(dec[i]) for i in idx]
    if not vals: return {}
    tails = []; ti = []; prev = [-1] * len(vals)
    for k, v in enumerate(vals):
        p = bisect.bisect_left(tails, v)
        if p > 0: prev[k] = ti[p - 1]
        if p == len(tails): tails.append(v); ti.append(k)
        else: tails[p] = v; ti[p] = k
    k = ti[-1]; ch = []
    while k >= 0: ch.append(k); k = prev[k]
    ch.reverse()
    keep = {idx[k]: vals[k] for k in ch}
    c = [idx[k] for k in ch]
    for a, b in zip(c, c[1:]):
        gi = list(range(a + 1, b)); gn = list(range(keep[a] + 1, keep[b]))
        if len(gi) == len(gn):
            for i, v in zip(gi, gn): keep[i] = v
    return keep


def read_numbers(rows, G, hi):
    """다른 책에서 만든 숫자 본보기로 대충 읽은 뒤, 확정된 번호로 본보기를 다시 만들어 되풀이한다."""
    order = sorted(range(len(rows)), key=lambda i: (rows[i]['pg'], rows[i]['half'], rows[i]['y0']))
    rows = [rows[i] for i in order]; G = G[order]

    sys.path.insert(0, HERE)
    from seed import LAB                                   # 쎈 중2-2 에서 만든 본보기
    C = np.load(os.path.join(HERE, 'seed.npy'))
    ids = sorted(LAB); M = C[ids]; lab = [LAB[i] for i in ids]

    def decode(T, names):
        dec = []; sc = []
        for gl in G:
            s = ''; mn = 1.0
            for v in gl:
                v = np.asarray(v)
                if not v.any(): s += '?'; mn = 0; continue
                sim = T @ v; k = int(np.argmax(sim)); s += names[k]; mn = min(mn, float(sim[k]))
            dec.append(s); sc.append(mn)
        return dec, sc

    dec, sc = decode(M, lab)
    keep = lis_assign(dec, sc, 0.40, hi)
    print(f'  1차 {len(keep)}개')
    for _ in range(6):
        T = collections.defaultdict(list)
        for i, n in keep.items():
            for j, ch in enumerate(f'{n:04d}'): T[int(ch)].append(G[i][j])
        if len(T) < 10: break
        TK = sorted(T)
        TM = np.array([np.mean(T[k], 0) for k in TK])
        TM /= np.linalg.norm(TM, axis=1, keepdims=True)
        dec, sc = decode(TM, [str(k) for k in TK])
        keep = lis_assign(dec, sc, 0.42, hi)
    # 빠진 번호 메우기
    ham = lambda a, b: sum(1 for x, y in zip(a, b) if x != y)
    for _ in range(4):
        byval = {v: i for i, v in keep.items()}; added = 0
        for n in [x for x in range(1, max(keep.values()) + 1) if x not in byval]:
            a = byval.get(n - 1); b = byval.get(n + 1)
            if a is None or b is None or not (a < b): continue
            free = [i for i in range(a + 1, b) if i not in keep]
            close = [i for i in free if len(dec[i]) == 4 and ham(dec[i], f'{n:04d}') <= 1]
            pick = close[0] if len(close) == 1 else (free[0] if len(free) == 1 else None)
            if pick is not None: keep[pick] = n; byval[n] = pick; added += 1
        if not added: break
    return {keep[i]: rows[i]['pg'] for i in sorted(keep)}


# ── DB ─────────────────────────────────────────────────────────
def load_env():
    for f in ('.env.local', '.env'):
        p = os.path.join(ROOT, f)
        if not os.path.exists(p): continue
        for line in io.open(p, encoding='utf8'):
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1); os.environ.setdefault(k.strip(), v.strip())


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf'); ap.add_argument('book'); ap.add_argument('grade'); ap.add_argument('semester')
    ap.add_argument('--offset', type=int, default=1)
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    load_env()

    print(f'{a.book} {a.grade}-{a.semester}  (인쇄 쪽 = PDF 쪽 + {a.offset})')
    rows = api('/rest/v1/problems', {'select': 'id,local_no', 'book': 'eq.' + a.book,
                                     'grade': 'eq.' + a.grade, 'semester': 'eq.' + a.semester,
                                     'limit': 5000})
    nums = [int(r['local_no']) for r in rows if str(r['local_no']).isdigit()]
    if not nums: sys.exit('✗ 이 교재는 번호가 숫자가 아닙니다(쎈B·베이직쎈 형식).')
    hi = max(nums) + 20
    print(f'  DB 문항 {len(rows)}개, 번호 {min(nums)}~{max(nums)}')

    det, G = scan(a.pdf)
    print(f'  번호 후보 {len(det)}개')
    page = read_numbers(det, G, hi)
    ns = sorted(page)
    print(f'  번호 읽음 {len(page)}개 ({ns[0]}~{ns[-1]})')
    back = [n for x, n in zip(ns, ns[1:]) if page[n] < page[x]]
    print(f'  쪽이 거꾸로인 곳 {len(back)}  ← 0이어야 한다')
    if back: sys.exit('✗ 번호를 잘못 읽었습니다. 멈춥니다.')

    # 앞뒤 쪽이 같으면 그 사이 번호도 같은 쪽
    def guess(n):
        i = bisect.bisect_left(ns, n)
        if i == 0 or i >= len(ns): return None
        lo, hi2 = ns[i - 1], ns[i]
        return page[lo] if page[lo] == page[hi2] else None

    by = collections.defaultdict(list); missing = 0
    for r in rows:
        if not str(r['local_no']).isdigit(): continue
        n = int(r['local_no'])
        p = page.get(n) or guess(n)
        if p is None: missing += 1; continue
        by[p + a.offset].append(r['id'])
    total = sum(len(v) for v in by.values())
    print(f'  쪽을 붙일 문항 {total} / {len(rows)}  (못 붙임 {missing})')
    print('  보기:', ', '.join(f'{n}번→{page[n] + a.offset}쪽' for n in ns[:3] + ns[len(ns) // 2:len(ns) // 2 + 2]))

    if not a.write:
        print('  (--write 를 붙여야 실제로 저장합니다)')
        return
    done = 0
    for p, ids in by.items():
        for i in range(0, len(ids), 200):
            chunk = ids[i:i + 200]
            api('/rest/v1/problems', {'id': 'in.(' + ','.join(map(str, chunk)) + ')'},
                method='PATCH', data=json.dumps({'page_no': p}).encode())
            done += len(chunk)
    print(f'  ✓ 저장 {done}개')


if __name__ == '__main__':
    main()
