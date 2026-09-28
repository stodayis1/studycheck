"""쎈 해설집 PDF → 문항별 「풀이」 그림 자르기.

선생님이 서술형(증명) 문제를 채점할 때 해설의 풀이를 그대로 보려고 만든다.
정답만으로는 증명 문제를 매길 수 없다.

해설집 판짜기
  · 한 쪽 = 2단. 가운데에 세로 줄이 있다
  · 풀이마다 왼쪽에 **연두색 4자리 번호**(0359 …)가 붙는다
  · 한 풀이는 그 번호 줄부터 다음 번호 줄 바로 앞까지 (채점 기준 표도 그 풀이의 일부다)
  · 단 끝에서 잘리면 다음 단(또는 다음 쪽 왼쪽 단)으로 이어진다 → 두 조각을 위아래로 붙인다

쓰는 법
  python scripts/crop-solutions/crop.py "<해설집 PDF>" <나갈폴더> [--pages 30-60] [--dpi 200]
  결과: <나갈폴더>/0359.png … 와 index.json(번호 → 파일)
"""
import argparse
import json
import os

import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage

GW, GH = 14, 20            # 글자 틀 크기 (page-map/seed.npy 와 같아야 한다)


def colored(im):
    """색 글자만 남긴다. 번호 색은 단원마다 다르다(연두·파랑·청록…)."""
    mx = im.max(2)
    mn = im.min(2)
    return (mx - mn > 22) & (mx < 245) & (im.mean(2) < 228)


def labels(m, x0, x1, hmin=None, hmax=None):
    """한 단 안에서 가로로 붙은 덩어리(=번호 후보)를 찾는다.
    번호는 단 왼쪽 끝 일정한 자리에 붙으므로, x 자리는 뒤에서 최빈값으로 거른다."""
    hmin = hmin if hmin is not None else 18 * SC
    hmax = hmax if hmax is not None else 36 * SC
    sub = m[:, x0:x1]
    lab, _ = ndimage.label(sub)
    bx = []
    for sl in ndimage.find_objects(lab):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if hmin <= h <= hmax and 4 * SC <= w <= 95 * SC:
            bx.append([sl[1].start + x0, sl[1].stop + x0, sl[0].start, sl[0].stop])
    bx.sort(key=lambda b: (b[2], b[0]))
    out, cur = [], []
    for b in bx:
        if cur and (b[0] - cur[-1][1]) <= 18 * SC and abs(b[2] - cur[-1][2]) <= 8 * SC:
            cur.append(b)
        else:
            if cur:
                out.append(cur)
            cur = [b]
    if cur:
        out.append(cur)
    res = []
    for g in out:
        wide = g[-1][1] - g[0][0]
        # 4자리 번호는 200dpi 에서 폭 58~100px.
        # 「다른 풀이」·「전략」 딱지는 50px 쯤이라 여기서 빠진다 —
        # 딱지를 넣으면 '풀이의 경계'로 쓰여 풀이가 중간에 잘린다(0255 사고).
        # 번호인지 아닌지는 폭이 아니라 **읽어 보고** 정한다(아래 ok).
        if not (44 * SC <= wide <= 100 * SC):
            continue
        res.append(dict(x0=g[0][0], y0=min(b[2] for b in g), y1=max(b[3] for b in g), boxes=g))
    return res


DW = 16.0        # 숫자 한 글자 폭 (200dpi 기준). set_scale() 로 dpi 에 맞춘다
SC = 1.0


def set_scale(dpi):
    global DW, SC
    SC = dpi / 200.0
    DW = 16.0 * SC


def split(b):
    """붙어 버린 숫자 덩어리를 글자 수만큼 고르게 쪼갠다."""
    w = b[1] - b[0]
    nd = max(1, min(4, int(round(w / DW))))
    if nd == 1:
        return [b]
    step = w / nd
    return [[int(b[0] + i * step), int(b[0] + (i + 1) * step), b[2], b[3]] for i in range(nd)]


def glyphs(m, g, n=4):
    """번호는 늘 4자리이고 글자 폭이 고르다 → 덩어리 경계를 믿지 말고 전체 폭을 n등분한다.
    (숫자끼리 붙어 버린 곳이 많아 덩어리 경계로 자르면 자주 어긋난다)"""
    out = []
    y0, y1 = g['y0'], g['y1']
    xa = g['boxes'][0][0]
    xb = g['boxes'][-1][1]
    # 번호 폭은 책마다 조금 다르다 (중3-2는 64px, 중2-2는 56px @200dpi).
    # 폭이 4자리로 볼 만하면 **그 폭을 그대로** n등분한다.
    # 책에 맞지 않는 폭(DW*n)으로 고정하면 글자가 한 칸씩 밀려 못 읽는다.
    if xb - xa < 44 * SC:
        xb = xa + int(DW * n)                          # 끝 자리가 안 잡힌 경우만 채운다
    step = (xb - xa) / n
    boxes = [[int(xa + i * step), int(xa + (i + 1) * step), y0, y1] for i in range(n)]
    for b in boxes:
        p = m[y0:y1, b[0]:b[1]]
        ys = np.where(p.any(1))[0]
        xs = np.where(p.any(0))[0]
        if not len(ys):
            out.append(np.zeros(GW * GH))
            continue
        q = (p[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1] * 255).astype(np.uint8)
        h0, w0 = q.shape
        nw = max(1, min(GW, int(round(w0 * GH / h0))))
        c = Image.new('L', (GW, GH), 0)
        c.paste(Image.fromarray(q).resize((nw, GH), Image.BILINEAR), ((GW - nw) // 2, 0))
        v = np.asarray(c, float).ravel()
        v -= v.mean()
        v /= (np.linalg.norm(v) or 1)
        out.append(v)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('out')
    ap.add_argument('--pages', default='')
    ap.add_argument('--dpi', type=int, default=200)
    ap.add_argument('--top', type=int, default=90, help='쪽 위 머리말은 버린다(px)')
    ap.add_argument('--bottom', type=int, default=80, help='쪽 아래 꼬리말은 버린다(px)')
    ap.add_argument('--first', type=int, default=1, help='첫 풀이의 문항 번호')
    ap.add_argument('--dry', action='store_true', help='자르지 않고 검출 결과만 본다')
    ap.add_argument('--digits', default='', help='이 해설집 글꼴로 만든 숫자 본보기 폴더(digits.py 참고)')
    ap.add_argument('--conf', type=float, default=0.55, help='숫자로 인정할 닮은 정도')
    ap.add_argument('--max', type=int, default=0, help='이 책의 가장 큰 문항 번호(넘으면 잘못 읽은 것)')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    here = os.path.dirname(os.path.abspath(__file__))
    import sys
    if a.digits:
        # 이 해설집 글꼴로 만든 본보기 (교재 글꼴로 읽으면 0을 9로 읽는다)
        T = np.load(os.path.join(a.digits, 'digits.npy'))
        names = open(os.path.join(a.digits, 'digits.txt'), encoding='utf8').read().split(',')
    else:
        seed_dir = os.path.join(os.path.dirname(here), 'page-map')
        sys.path.insert(0, seed_dir)
        from seed import LAB                                # noqa: E402
        C = np.load(os.path.join(seed_dir, 'seed.npy'))
        ids = sorted(LAB)
        T, names = C[ids], [LAB[i] for i in ids]

    set_scale(a.dpi)
    d = pymupdf.open(a.pdf)
    rng = range(len(d))
    if a.pages:
        s, e = a.pages.split('-')
        rng = range(int(s), int(e) + 1)

    # 1) 쪽마다 단을 나눠 **번호 자리만** 찾는다 (읽기는 기준 자리를 정한 뒤에)
    cols = []
    pages = {}
    xs = {}
    for i in rng:
        pm = d[i].get_pixmap(dpi=a.dpi)
        im = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].copy()
        pages[i] = im
        H, W = im.shape[:2]
        m = colored(im.astype(int))
        mid = W // 2
        for c, (x0, x1) in enumerate([(0, mid), (mid, W)]):
            gs = [g for g in labels(m, x0, x1) if a.top <= g['y0'] <= H - a.bottom]
            gs.sort(key=lambda g: g['y0'])
            xs.setdefault(c, []).extend(g['x0'] - x0 for g in gs)
            cols.append(dict(page=i, col=c, x0=x0, x1=x1, gs=gs))
        if i % 10 == 0:
            print(f'  쪽 {i} 누적 자리 {sum(len(c["gs"]) for c in cols)}', flush=True)

    # 2) 번호가 붙는 기준 자리(단마다 한두 곳)를 정한다
    import collections
    anchors = {}
    for c, v in xs.items():
        cnt = collections.Counter(v)
        if not cnt:
            continue
        top = cnt.most_common(1)[0][1]
        cand = sorted(x for x, k in cnt.items() if k >= top * 0.2)
        anchors[c] = [x for x in cand if x - cand[0] <= 60 * SC]
    print('  번호가 붙는 x 자리:', anchors)

    # 3) 기준 자리에 맞춰 번호를 읽는다.
    #    덩어리가 시작하는 곳이 아니라 **기준 자리**에서 4자리 폭을 읽어야 어긋나지 않는다
    #    (앞자리 0이 따로 안 잡히거나 옆 글자가 붙는 일이 잦다)
    for c in cols:
        ax = anchors.get(c['col'], [])
        m = colored(pages[c['page']].astype(int))
        nums = []
        for g in c['gs']:
            off = g['x0'] - c['x0']
            near = min(ax, key=lambda x: abs(x - off)) if ax else off
            if abs(near - off) > 8 * SC:
                continue
            g2 = dict(g)
            g2['boxes'] = [[c['x0'] + near, c['x0'] + near + int(DW * 4), g['y0'], g['y1']]]
            s2 = ''
            conf = 1.0
            for v in glyphs(m, g2):
                v = np.asarray(v)
                if not v.any():
                    s2 += '?'
                    conf = 0
                    continue
                sim = T @ v
                k = int(np.argmax(sim))
                s2 += names[k]
                conf = min(conf, float(sim[k]))
            ok = (s2.isdigit() and conf >= a.conf and (not a.max or 1 <= int(s2) <= a.max))
            nums.append(dict(num=s2, conf=conf, y=g['y0'], x=g['x0'], ok=ok))
        nums.sort(key=lambda n: (n['y'], n['x']))
        merged = []
        for n in nums:
            if merged and n['y'] - merged[-1]['y'] < 30 * SC:
                if (n['ok'], n['conf']) > (merged[-1]['ok'], merged[-1]['conf']):
                    merged[-1] = n
                continue
            merged.append(n)
        c['nums'] = merged

    flat = [(ci, k, n) for ci, c in enumerate(cols) for k, n in enumerate(c['nums'])]

    # 읽은 번호 중 **오름차순으로 이어지는 가장 긴 줄기**만 믿는다.
    # 잘못 잡힌 색 글자나 잘못 읽은 번호는 여기서 걸러진다.
    # (걸러진 자리도 '풀이의 경계'로는 그대로 쓴다 — 안 그러면 두 풀이가 한 장에 붙는다)
    vals = [int(n['num']) if n['ok'] else None for _, _, n in flat]
    print(f'  읽기: 4자리 숫자로 읽힌 자리 {sum(v is not None for v in vals)}/{len(vals)}')
    idx = [i2 for i2, v in enumerate(vals) if v is not None]
    best, prev = [], {}
    for i2 in idx:                                  # 가장 긴 증가 부분수열 (O(n^2), 몇 백 개라 충분)
        cand = [j for j in best if vals[j] < vals[i2]]
        prev[i2] = cand[-1] if cand else None
        if not best or vals[i2] > vals[best[-1]]:
            best.append(i2)
        else:
            import bisect
            pos = bisect.bisect_left([vals[j] for j in best], vals[i2])
            best[pos] = i2
    chain, cur = [], best[-1] if best else None
    while cur is not None:
        chain.append(cur)
        cur = prev.get(cur)
    chain = set(chain)
    for i2, (_, _, n) in enumerate(flat):
        n['seq'] = vals[i2] if i2 in chain else None

    # 믿을 수 있는 번호 사이에, 자리 수와 번호 수가 **정확히 같으면** 그 사이를 채운다.
    # (예: 9번과 11번 사이에 자리가 딱 하나면 그 자리는 10번이 맞다)
    sure = [i2 for i2, (_, _, n) in enumerate(flat) if n['seq']]
    filled = 0
    for p1, p2 in zip(sure, sure[1:]):
        v1, v2 = flat[p1][2]['seq'], flat[p2][2]['seq']
        if p2 - p1 == v2 - v1 and p2 - p1 > 1:
            for t in range(1, p2 - p1):
                flat[p1 + t][2]['seq'] = v1 + t
                filled += 1
    if filled:
        print(f'  사이가 딱 맞아 채운 번호 {filled}개')

    got = sorted(n['seq'] for _, _, n in flat if n['seq'])
    print(f'번호 자리 {len(flat)}개 · 번호를 믿을 수 있는 것 {len(got)}개'
          + (f' · {got[0]}~{got[-1]}' if got else ''))
    if got:
        missing = [v for v in range(got[0], got[-1] + 1) if v not in set(got)]
        print(f'  빠진 번호 {len(missing)}개' + (f' 앞 20개 {missing[:20]}' if missing else ''))
    if a.dry:
        return

    # 2) 각 번호의 풀이 구간을 정한다
    index = {}
    for j, (ci, k, n) in enumerate(flat):
        if not n['seq']:            # 번호를 못 믿는 자리 — 경계로만 쓰고 그림은 안 만든다
            continue
        c = cols[ci]
        im = pages[c['page']]
        H = im.shape[0]
        top = max(a.top, n['y'] - 8)
        if k + 1 < len(c['nums']):                    # 같은 단에 다음 풀이가 있다
            parts = [(c['page'], c['x0'], c['x1'], top, c['nums'][k + 1]['y'] - 8)]
        else:                                          # 단 끝 → 다음 단으로 이어진다
            parts = [(c['page'], c['x0'], c['x1'], top, H - a.bottom)]
            if j + 1 < len(flat):
                ci2, k2, n2 = flat[j + 1]
                c2 = cols[ci2]
                if k2 == 0:                            # 다음 단의 첫 풀이 앞까지 이어 붙인다
                    parts.append((c2['page'], c2['x0'], c2['x1'], a.top, n2['y'] - 8))
        ims = []
        for pg, x0, x1, y0, y1 in parts:
            if y1 - y0 < 20:
                continue
            ims.append(Image.fromarray(pages[pg][y0:y1, x0:x1].astype(np.uint8)))
        if not ims:
            continue
        W = max(x.width for x in ims)
        Ht = sum(x.height for x in ims)
        canvas = Image.new('RGB', (W, Ht), 'white')
        y = 0
        for x in ims:
            canvas.paste(x, (0, y))
            y += x.height
        canvas = canvas.crop(trim(canvas))
        name = f"{n['seq']:04d}.png"
        canvas.save(os.path.join(a.out, name))
        index[str(n['seq'])] = dict(file=name, page=c['page'], ocr=n['num'])

    json.dump(index, open(os.path.join(a.out, 'index.json'), 'w', encoding='utf8'), ensure_ascii=False)
    print(f'풀이 {len(index)}개 저장 → {a.out}')


def trim(img, pad=6):
    """가장자리 흰 여백을 줄인다."""
    a = np.asarray(img.convert('L'))
    ink = a < 245
    ys = np.where(ink.any(1))[0]
    xs = np.where(ink.any(0))[0]
    if not len(ys):
        return (0, 0, img.width, img.height)
    return (max(0, xs[0] - pad), max(0, ys[0] - pad),
            min(img.width, xs[-1] + pad), min(img.height, ys[-1] + pad))


if __name__ == '__main__':
    main()
