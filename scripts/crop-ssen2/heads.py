"""A단계 문항마다 어느 묶음 지시문에 속하는지 정한다.

지시문은 단을 넘고 쪽도 넘는다 (0498~0501 은 왼쪽 단 아래에서 시작해
오른쪽 단 위까지 간다). 그래서 쪽·단 안에서만 찾으면 뒤쪽 문항이 앞머리를 잃는다.
→ **읽는 순서대로 책 전체를 한 번 훑으며** 가장 최근 지시문을 물려준다.
소단원 배지나 유형 배지를 만나면 묶음이 끝난 것으로 보고 끊는다.
"""
import json
import io
import os
import s2det
from furniture import furniture, columns, at_left_edge

HERE = os.path.dirname(os.path.abspath(__file__))


def build(pdf='q.pdf'):
    seq = json.load(io.open(os.path.join(HERE, 'qnum.json'), encoding='utf8'))
    step = json.load(io.open(os.path.join(HERE, 'qstep.json'), encoding='utf8'))
    byp = {}
    for s in seq:
        byp.setdefault(s['pg'], []).append(s)
    head = {}
    cur = None
    for pg in sorted(byp):
        a = s2det.page(pdf, pg)
        W = a.shape[1]
        labels = [s for s in byp[pg] if s.get('N')]
        ed = columns(byp[pg], W)
        fur = furniture(a)
        items = []
        for r in fur:
            if r['what'] in ('bracket', 'sub') and not at_left_edge(r, ed, W):
                continue
            if r['what'] not in ('bracket', 'sub', 'type'):
                continue
            items.append((0 if r['x0'] < W // 2 else 1, r['y0'], 'f', r))
        for s in labels:
            items.append((s['side'], s['y0'], 'n', s))
        items.sort(key=lambda t: (t[0], t[1]))
        for side, y, kind, r in items:
            if kind == 'f':
                if r['what'] == 'bracket':
                    # 그 지시문이 거느리는 첫 문항 — 머리말 띠는 거기서 끝난다
                    fy = min((q['y0'] for q in labels
                              if q['side'] == side and abs(q['x0'] - r['x0']) <= 40
                              and q['y0'] > r['y1']), default=r['y1'] + 92)
                    cur = dict(pg=pg, y0=r['y0'], y1=r['y1'], x0=r['x0'],
                               side=side, firsty=int(fy))
                else:
                    cur = None
            elif step[str(r['N'])] == 'A' and cur:
                head[r['N']] = cur
    json.dump({str(k): v for k, v in head.items()},
              io.open(os.path.join(HERE, 'qhead.json'), 'w', encoding='utf8'),
              ensure_ascii=False)
    nA = sum(1 for n in range(1, 1324) if step[str(n)] == 'A')
    print(f'A단계 {nA}개 중 묶음 지시문이 붙는 문항 {len(head)}개')
    return head


if __name__ == '__main__':
    build()
