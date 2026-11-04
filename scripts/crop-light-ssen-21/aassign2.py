# -*- coding: utf-8 -*-
"""빠른 정답 목록의 번호 덩어리에 **번호를 붙인다**. (옛 aassign.py 를 대신한다)

  python aassign2.py            → aocr.json + aocr7.json → anums_ok.json

## 옛 방법이 왜 틀렸나

`aassign.py` 는 글자 모양을 해독해 번호를 **꽂았다**:

    gi = 사이에 있는 덩어리들;  gn = 사이에 빠진 번호들
    if len(gi) == len(gn):            # 개수만 같으면 1:1 로 꽂는다
        for i, v in zip(gi, gn): keep[i] = v

덩어리 하나를 잘못 찾고(없는 것을 찾고) 번호 하나를 놓치면 **개수가 우연히 맞아**
엉뚱한 덩어리에 번호가 들어간다. 그래서 구간마다 밀림이 생기고 쌓였다 — 419문항이 어긋났다.

## 이 파일의 규칙

빠른 정답 목록은 0001 부터 **차례대로** 나온다. 그러니 **자리 순서가 곧 번호**다.
OCR 로 읽은 번호는 그것이 맞는지 **확인하는 데만** 쓴다.

1. 읽기 순서(쪽 → 단 → 줄 → 가로)로 세운다
2. OCR 값이 **+1 씩 이어지는 가장 긴 사슬**을 잡는다. 사슬에 못 든 덩어리는 **버린다**
   (쪽머리의 「1」 같은 가짜가 여기서 걸러진다)
3. 사슬 사이에 빠진 번호가 있으면 — 사이 덩어리 수가 빠진 번호 수와 **같고**
   그 덩어리들이 **하나도 안 읽혔을 때만** 자리 순서대로 꽂는다.
   하나라도 읽혔는데 기대값과 다르면 **꽂지 않고 비운다.**
   비면 그 문항은 정답 그림이 없을 뿐이다 — **틀린 그림이 붙는 것보다 낫다.**
"""
import io
import json

rows = json.load(io.open('aocr.json', encoding='utf8')) + json.load(io.open('aocr7.json', encoding='utf8'))

# 읽기 순서 — 같은 줄은 20px 안으로 본다
ordr = sorted(range(len(rows)), key=lambda i: (rows[i]['pg'], rows[i]['half'], rows[i]['y0'], rows[i]['x0']))
rid = {}
base = None
cur = (-1, -1)
r = -1
for i in ordr:
    key = (rows[i]['pg'], rows[i]['half'])
    if key != cur or base is None or rows[i]['y0'] - base > 20:
        r += 1
        base = rows[i]['y0']
        cur = key
    rid[i] = r
ordr = sorted(range(len(rows)), key=lambda i: (rid[i], rows[i]['x0']))
rows = [rows[i] for i in ordr]
N = len(rows)

num = [int(r['ocr']) if len(r['ocr']) == 4 and r['ocr'].isdigit() else None for r in rows]

# ── 2. **읽기 순서를 따라 커지는** 가장 긴 사슬 (자리 순서는 그대로 두고 **고를** 뿐이다)
# +1 씩만 잇게 하면 OCR 이 한 자리 못 읽은 곳에서 사슬이 통째로 끊긴다 — 커지기만 하면 된다.
# 쪽머리의 「1」 같은 가짜는 앞 값보다 작으므로 여기서 저절로 빠진다.
import bisect
idx = [i for i in range(N) if num[i] is not None]
tails, ti = [], []
prev = [-1] * len(idx)
for k, i in enumerate(idx):
    p = bisect.bisect_left(tails, num[i])
    if p > 0:
        prev[k] = ti[p - 1]
    if p == len(tails):
        tails.append(num[i]); ti.append(k)
    else:
        tails[p] = num[i]; ti[p] = k
k = ti[-1]
chain = []
while k >= 0:
    chain.append(idx[k])
    k = prev[k]
chain.reverse()
keep = {i: num[i] for i in chain}
print(f'덩어리 {N} · OCR 로 읽힌 것 {sum(1 for v in num if v)} · 이어지는 사슬 {len(chain)}'
      f' ({num[chain[0]]:04d}~{num[chain[-1]]:04d})')

# ── 3. 사슬 사이 메우기 — **안 읽힌 자리만**
filled = skipped = 0
for a, b in zip(chain, chain[1:]):
    gi = list(range(a + 1, b))
    gn = list(range(keep[a] + 1, keep[b]))
    if not gi and not gn:
        continue
    if len(gi) == len(gn) and all(num[i] is None for i in gi):
        for i, v in zip(gi, gn):
            keep[i] = v
        filled += len(gi)
    else:
        skipped += len(gn)
        print(f'  비움: {keep[a]:04d} 다음 {len(gn)}개 — 사이 덩어리 {len(gi)}개'
              f' (읽힌 값 {[num[i] for i in gi]})')

mx = max(keep.values())
miss = [n for n in range(1, mx + 1) if n not in set(keep.values())]
print(f'번호 확정 {len(keep)} · 자리 순서로 메운 것 {filled} · 비운 것 {skipped}')
print(f'최대 {mx:04d} · 빠진 번호 {len(miss)}개' + (f' → {miss[:20]}' if miss else ''))

out = [dict(rows[i], no=keep[i]) for i in sorted(keep)]
json.dump(out, io.open('anums_ok.json', 'w', encoding='utf8'))
