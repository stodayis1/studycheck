# -*- coding: utf-8 -*-
"""후보 모으기 → 글자 배우기 → 번호 차례와 맞추기 를 한 번에"""
import io
import json
import sys
import time
import numpy as np
from cand import cands, glyphs
import mnum
from gl import collect
from selfread import train, centroids, read, knn
from align import run


def collect_cands():
    N = len(mnum.doc('q.pdf'))
    rows = []
    t = time.time()
    for p in range(N):
        try:
            a, C = cands(p)
        except Exception as e:
            print('err', p, e)
            continue
        good = []
        for r in C:
            g = glyphs(a, r)
            if len(g) != 4:
                continue
            r['gx'] = [[q['x0'], q['x1'], q['y0'], q['y1']] for q in g]
            good.append(r)
        # 읽는 차례: 단 → 줄(y 가까운 것끼리) → 줄 안에서 왼쪽부터
        rows.extend(good)
        if p % 60 == 0:
            print('  %d쪽 후보 %d (%.0fs)' % (p, len(rows), time.time() - t), flush=True)
    return rows


def rescue_pass(rows, S, out, holes, N=1272):
    """빈 구간만 느슨한 기준으로 다시 훑어 후보를 보탠다"""
    from rescue import scan
    from anchor import fill
    from reorder import order
    from gl import patch
    import numpy as _np
    if not holes:
        return rows, S, out, {}, holes
    n2 = {v: k for k, v in out.items()}
    have = {(r['pg'], r['col'], r['y0'] // 8) for r in rows}
    add = []
    for h in holes:
        n0, n1 = h['between']
        if n0 not in n2 or n1 not in n2:
            continue
        A, B = rows[n2[n0]], rows[n2[n1]]
        spans = []
        if (A['pg'], A['col']) == (B['pg'], B['col']):
            spans = [(A['pg'], A['col'], A['y0'] + 30, B['y0'])]
        else:
            spans = [(A['pg'], A['col'], A['y0'] + 30, 2250), (B['pg'], B['col'], 100, B['y0'])]
            for p in range(A['pg'] + 1, B['pg']):
                spans += [(p, 0, 100, 2250), (p, 1, 100, 2250)]
        for pg, col, s0, s1 in spans:
            if s1 <= s0:
                continue
            for L in (mnum.margins(mnum.page(pg)).get(col) or []):
                a_, cs = scan(pg, col, s0, s1, L)
                for r in cs:
                    key = (r['pg'], r['col'], r['y0'] // 8)
                    if key in have:
                        continue
                    g = glyphs(a_, r)
                    if len(g) != 4:
                        continue
                    r['gx'] = [[q['x0'], q['x1'], q['y0'], q['y1']] for q in g]
                    have.add(key)
                    add.append(r)
    if not add:
        return rows, S, out, {}, holes
    print('  구조대가 보탠 후보 %d' % len(add), flush=True)
    raw = rows + add
    idx = order(raw, len(mnum.doc('q.pdf')))
    rows2 = [raw[i] for i in idx]
    X2, own2 = collect(rows2)
    D, M = _np.load('cD.npy'), _np.load('cM.npy')
    S2 = read(X2, own2, rows2, D, M)
    out2, a2, holes2 = fill(rows2, S2)
    # 배운 본보기로 한 번 더 또렷이 읽는다
    ex, ey = train(X2, own2, rows2, out2, strict=True, S=S2)
    S2 = knn(X2, own2, rows2, ex, ey)
    out2, a2, holes2 = fill(rows2, S2)
    _np.save('X.npy', X2)
    json.dump(own2, io.open('own.json', 'w'))
    return rows2, S2, out2, a2, holes2


def main():
    raw = collect_cands()
    from reorder import order
    idx = order(raw, len(mnum.doc('q.pdf')))
    rows = [raw[i] for i in idx]
    json.dump(rows, io.open('cand.json', 'w', encoding='utf8'), ensure_ascii=False)
    X, own = collect(rows)
    np.save('X.npy', X)
    json.dump(own, io.open('own.json', 'w'))
    print('후보 %d · 글자 %d' % (len(rows), len(X)))
    D, M = np.load('cD.npy'), np.load('cM.npy')
    S = read(X, own, rows, D, M)
    pair = run(S)
    best = (len(pair), pair, S, D, M)
    print('0회 — 맞춘 %d/1272' % len(pair), flush=True)
    for it in range(10):
        ex, ey = train(X, own, rows, pair, strict=(it > 0), S=S)
        D, M = centroids(ex, ey)
        S = knn(X, own, rows, ex, ey)
        p2 = run(S)
        print('%d회 — 맞춘 %d/1272, 버린 후보 %d'
              % (it + 1, len(p2), len(rows) - len(p2)), flush=True)
        if len(p2) > best[0]:
            best = (len(p2), p2, S, D, M)
        if p2 == pair:
            break
        pair = p2
    n, pair, S, D, M = best
    json.dump({str(k): v for k, v in pair.items()}, io.open('pair.json', 'w'))
    json.dump(S, io.open('reads2.json', 'w'))
    np.save('cD.npy', D)
    np.save('cM.npy', M)
    from anchor import fill
    out, a, holes = fill(rows, S)
    print('1차 — 못 %d · %d/1272 · 빈 구간 %d' % (len(a), len(out), len(holes)), flush=True)
    rows, S, out, a, holes = rescue_pass(rows, S, out, holes)
    # ※ 구조대가 후보를 보태면 **번호(index)가 밀린다** — 반드시 다시 저장해야
    #    assign.json 과 cand.json 이 같은 줄을 가리킨다.
    json.dump(rows, io.open('cand.json', 'w', encoding='utf8'), ensure_ascii=False)
    json.dump(S, io.open('reads2.json', 'w'))
    json.dump({str(k): v for k, v in out.items()}, io.open('assign.json', 'w'))
    print('못 %d · 최종 %d/1272' % (len(a), len(out)))
    print('빈 구간 %d곳 · 번호 %d개' % (len(holes), sum(h['nums'] for h in holes)))
    for h in holes:
        print('   %s 후보%d : 번호%d' % (h['between'], h['cands'], h['nums']))


if __name__ == '__main__':
    main()
