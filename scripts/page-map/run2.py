"""소단원마다 번호가 1부터 다시 시작하는 교재(쎈B·베이직쎈)의 **문항번호 → 쪽**을 읽는다.

쎈은 책 전체에서 번호가 한 번만 매겨져(0001…) run.py 로 되지만,
쎈B·베이직쎈은 소단원마다 1, 2, 3 … 으로 다시 시작해서 방법이 다르다.

어떻게 하나
  1) 쪽마다 색 글자로 된 번호(1~2자리)를 찾아 읽는다
  2) 읽기 순서대로 늘어놓고, **번호가 뚝 떨어지는 곳**을 소단원 경계로 본다
  3) k번째 덩어리 = DB의 k번째 소단원 → (소단원, 번호) 로 쪽을 붙인다

쓰는 법
  python scripts/page-map/run2.py "<문제집 PDF>" 쎈B 중2 2 --offset 1
  python scripts/page-map/run2.py "<문제집 PDF>" 쎈B 중2 2 --offset 1 --write
"""
import argparse
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


def color_mask(im):
    mx = im.max(2); mn = im.min(2)
    col = ((mx - mn) > 22) & (mx < 250) & (mn < 215)
    seed = ndimage.binary_dilation(col, np.ones((3, 3), bool), iterations=2)
    return seed & (im.mean(2) < 195)


def groups(m, wmin, wmax, hmin, hmax):
    """가로로 붙어 있는 색 글자 덩어리(=번호)를 찾는다."""
    lab, _ = ndimage.label(m)
    bx = []
    for sl in ndimage.find_objects(lab):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if hmin <= h <= hmax and 3 <= w <= 60:
            bx.append((sl[1].start, sl[1].stop, sl[0].start, sl[0].stop))
    bx.sort(key=lambda b: (b[2], b[0]))
    rows = []; base = None; r = -1
    for b in bx:
        if base is None or b[2] - base > 12: r += 1; base = b[2]
        rows.append((r, b))
    bx = [b for _, b in sorted(rows, key=lambda rb: (rb[0], rb[1][0]))]
    res = []; cur = []
    for b in bx:
        if cur and -3 <= b[0] - cur[-1][1] <= 11 and abs(b[2] - cur[-1][2]) < 9: cur.append(b)
        else:
            if cur: res.append(cur)
            cur = [b]
    if cur: res.append(cur)
    out = []
    for g in res:
        w = g[-1][1] - g[0][0]; h = max(b[3] for b in g) - min(b[2] for b in g)
        if wmin <= w <= wmax and hmin <= h <= hmax and len(g) <= 2: out.append(g)
    return out


def glyphs(m, g):
    out = []
    y0 = min(b[2] for b in g); y1 = max(b[3] for b in g)
    for b in g:
        p = m[y0:y1, b[0]:b[1]]
        ys = np.where(p.any(1))[0]; xs = np.where(p.any(0))[0]
        if not len(ys): out.append(np.zeros(GW * GH)); continue
        q = (p[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1] * 255).astype(np.uint8)
        h0, w0 = q.shape
        nw = max(1, min(GW, int(round(w0 * GH / h0))))
        c = Image.new('L', (GW, GH), 0)
        c.paste(Image.fromarray(q).resize((nw, GH), Image.BILINEAR), ((GW - nw) // 2, 0))
        v = np.asarray(c, float).ravel(); v -= v.mean(); v /= (np.linalg.norm(v) or 1)
        out.append(v)
    return out


def scan(pdf, wmin, wmax, hmin, hmax):
    d = pymupdf.open(pdf)
    rows = []; gl = []
    for i in range(len(d)):
        pm = d[i].get_pixmap(dpi=DPI)
        im = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].astype(int)
        m = color_mask(im); W = im.shape[1]
        for g in groups(m, wmin, wmax, hmin, hmax):
            rows.append(dict(pg=i, x0=int(g[0][0]), y0=int(min(b[2] for b in g)),
                             half=0 if g[0][0] < W // 2 else 1, n=len(g)))
            gl.append(glyphs(m, g))
        if i % 25 == 0: print(f'  쪽 {i}/{len(d)} 누적 {len(rows)}', flush=True)
    return rows, gl


def decode(gl, T, names):
    out = []
    for g in gl:
        s = ''; mn = 1.0
        for v in g:
            v = np.asarray(v)
            if not v.any(): s += '?'; mn = 0; continue
            sim = T @ v; k = int(np.argmax(sim)); s += names[k]; mn = min(mn, float(sim[k]))
        out.append((s, mn))
    return out


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
    ap.add_argument('--wmin', type=int, default=24); ap.add_argument('--wmax', type=int, default=62)
    ap.add_argument('--hmin', type=int, default=18); ap.add_argument('--hmax', type=int, default=36)
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    load_env()

    rows = api('/rest/v1/problems',
               {'select': 'id,sub_chapter_no,local_no', 'book': 'eq.' + a.book,
                'grade': 'eq.' + a.grade, 'semester': 'eq.' + a.semester, 'limit': 5000})
    bysub = collections.defaultdict(list)
    for r in rows:
        if str(r['local_no']).isdigit(): bysub[r['sub_chapter_no']].append(r)
    subs = sorted(bysub)
    for s in subs: bysub[s].sort(key=lambda r: int(r['local_no']))
    print(f'{a.book} {a.grade}-{a.semester}  DB 문항 {len(rows)} · 소단원 {len(subs)}개')
    print('  소단원별 번호 끝:', ', '.join(f'{s}→{int(bysub[s][-1]["local_no"])}' for s in subs))

    det, gl = scan(a.pdf, a.wmin, a.wmax, a.hmin, a.hmax)
    order = sorted(range(len(det)), key=lambda i: (det[i]['pg'], det[i]['half'], det[i]['y0']))
    det = [det[i] for i in order]; gl = [gl[i] for i in order]
    print(f'  번호 후보 {len(det)}개')

    sys.path.insert(0, HERE)
    from seed import LAB
    C = np.load(os.path.join(HERE, 'seed.npy'))
    ids = sorted(LAB); M = C[ids]; lab = [LAB[i] for i in ids]
    dec = decode(gl, M, lab)

    # 번호가 뚝 떨어지면 새 소단원
    runs = []; cur = []
    last = 0
    for i, (s, conf) in enumerate(dec):
        if not s.isdigit() or conf < 0.35: continue
        v = int(s)
        if not (1 <= v <= 200): continue
        if cur and v <= last - 3:       # 확실히 떨어질 때만 (잘못 읽은 한두 개는 무시)
            runs.append(cur); cur = []
        cur.append((i, v)); last = v
    if cur: runs.append(cur)
    runs = [r for r in runs if len(r) >= 10]
    print(f'  덩어리 {len(runs)}개 (소단원 {len(subs)}개여야 맞는다)')
    for k, r in enumerate(runs):
        print(f'    {k + 1}: {len(r)}개  {r[0][1]}~{r[-1][1]}  (PDF {det[r[0][0]]["pg"]}~{det[r[-1][0]]["pg"]}쪽)')
    if len(runs) != len(subs):
        print('  ✗ 덩어리 수가 소단원 수와 달라 멈춥니다. --wmin/--wmax 를 조절해 보세요.')
        return

    page = {}                                   # (소단원, 번호) → PDF 쪽
    for sub, run in zip(subs, runs):
        for i, v in run:
            page.setdefault((sub, v), det[i]['pg'])
    by = collections.defaultdict(list); miss = 0
    for s in subs:
        for r in bysub[s]:
            p = page.get((s, int(r['local_no'])))
            if p is None: miss += 1; continue
            by[p + a.offset].append(r['id'])
    total = sum(len(v) for v in by.values())
    print(f'  쪽을 붙일 문항 {total} / {len(rows)}  (못 붙임 {miss})')

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
