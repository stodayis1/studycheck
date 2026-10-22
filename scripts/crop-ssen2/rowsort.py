"""한 쪽 안에서 라벨을 사람이 읽는 차례로 세운다.

A단계 쪽은 한 단 안에 문항이 가로로 둘씩 들어간다(0623 옆에 0624).
y 를 고정 간격으로 묶으면 1픽셀 차이가 경계를 넘어 둘의 앞뒤가 뒤집힌다 →
**가까운 y 끼리 줄로 묶고**, 줄은 y 로, 줄 안은 x 로 세운다.
"""


def rowsort(items, gap=30):
    out = []
    for side in sorted({s['side'] for s in items}):
        ss = sorted((s for s in items if s['side'] == side), key=lambda s: s['y0'])
        rows = []
        for s in ss:
            if rows and s['y0'] - rows[-1][-1]['y0'] <= gap:
                rows[-1].append(s)
            else:
                rows.append([s])
        for r in rows:
            out += sorted(r, key=lambda s: s['x0'])
    return out
