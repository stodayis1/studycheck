# -*- coding: utf-8 -*-
"""마플시너지 공통수학2 — 번호 찾기·읽기·차례 맞추기를 한 번에"""
import io
import json
import time
import numpy as np
import mnum
from pdet import numbers
from pglyph import glyphs, patch
from pmap import MAP26
from selfread import train, centroids, knn
import align
from anchor import fill

NMAX = 1895
LAST = 329          # 본편은 여기까지, 뒤는 내신연계기출(번호가 따로)


def collect():
    rows = []
    t = time.time()
    for p in range(LAST):
        a, L = numbers(p, mode='ink')
        for r in L:
            g = glyphs(a, r)
            if len(g) != 4:
                continue
            r['gx'] = g
            rows.append(r)
        if p % 80 == 0:
            print('  %d쪽 %d (%.0fs)' % (p, len(rows), time.time() - t), flush=True)
    rows.sort(key=lambda r: (r['pg'], r['col'], r['y0'], r['x0']))
    return rows


def vectors(rows):
    X, own = [], []
    byp = {}
    for i, r in enumerate(rows):
        byp.setdefault(r['pg'], []).append(i)
    for pg in sorted(byp):
        a = mnum.page(pg)
        for i in byp[pg]:
            for j, g in enumerate(rows[i]['gx']):
                v = patch(a, g)
                if v is None:
                    continue
                X.append(v)
                own.append((i, j))
    return np.array(X, np.float32), own


def main():
    rows = collect()
    json.dump(rows, io.open('cand.json', 'w', encoding='utf8'), ensure_ascii=False)
    X, own = vectors(rows)
    np.save('X.npy', X)
    json.dump(own, io.open('own.json', 'w'))
    print('후보 %d · 글자 %d' % (len(rows), len(X)))
    # 1차 — 한 번 배워 둔 본보기(ex/ey)가 있으면 그걸로, 없으면 뭉치표로 읽는다
    import os
    if os.path.exists('ex.npy'):
        S = knn(X, own, rows, np.load('ex.npy'), np.load('ey.npy'))
    else:
        from gl import kmeans
        C, lab = kmeans(X, k=26, seed=11)
        reads = [[] for _ in rows]
        for k, (i, j) in enumerate(own):
            reads[i].append((j, MAP26.get(int(lab[k]), '?')))
        S = [''.join(str(c) for _, c in sorted(g)) for g in reads]
    align.SKIP_N = -1.0
    pair = align.run(S, N=NMAX)
    print('0회 — 맞춘 %d/%d' % (len(pair), NMAX), flush=True)
    # 2차 — 맞춘 번호로 글꼴을 다시 배워 읽는다
    for it in range(4):
        ex, ey = train(X, own, rows, pair, strict=(it > 0), S=S)
        S = knn(X, own, rows, ex, ey)
        p2 = align.run(S, N=NMAX)
        ag = sum(1 for k, v in p2.items() if S[k] == '%04d' % v)
        print('%d회 — 맞춘 %d/%d, 읽기 일치 %d' % (it + 1, len(p2), NMAX, ag), flush=True)
        if p2 == pair:
            break
        pair = p2
    ex, ey = train(X, own, rows, pair, strict=True, S=S)
    np.save('ex.npy', ex)
    np.save('ey.npy', ey)
    json.dump(S, io.open('reads.json', 'w'))
    json.dump({str(k): v for k, v in pair.items()}, io.open('pair.json', 'w'))
    out, a, holes = fill(rows, S, N=NMAX)
    json.dump({str(k): v for k, v in out.items()}, io.open('assign.json', 'w'))
    print('못 %d · 최종 %d/%d · 빈 구간 %d' % (len(a), len(out), NMAX, len(holes)))
    for h in holes[:20]:
        print('   %s 후보%d : 번호%d' % (h['between'], h['cands'], h['nums']))


if __name__ == '__main__':
    main()
