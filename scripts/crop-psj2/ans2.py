"""답지에서 문항 번호와 「정답_」 줄을 **읽기 순서**로 늘어놓고 짝짓는다.

앞서 쓰던 규칙(같은 칸에서 바로 위의 번호)은 정답이 다음 칸·다음 쪽으로 넘어간
67문항을 놓쳤다. 번호 다음에 처음 나오는 「정답_」 이 그 번호의 답이다.
"""
import io
import json
import re
import pymupdf

s = pymupdf.open('sol.pdf')
ev = []
for pi, p in enumerate(s):
    items = []
    for b in p.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b.get('lines', []):
            t = ''.join(z['text'] for z in l['spans']).strip()
            if not t:
                continue
            sp = l['spans'][0]
            col = 1 if l['bbox'][0] > 300 else 0
            if 'Leferi' in sp['font'] and re.fullmatch(r'\d{3}', t):
                items.append((col, l['bbox'][1], 'n', int(t), list(l['bbox'])))
            elif t.startswith('정답_'):
                items.append((col, l['bbox'][1], 'a', t[3:].strip(), list(l['bbox'])))
    items.sort(key=lambda r: (r[0], r[1]))
    for col, y, k, v, bb in items:
        ev.append(dict(pg=pi, col=col, y=y, k=k, v=v, bb=bb))

A = {}
cur = None
for e in ev:
    if e['k'] == 'n':
        cur = e['v']
    elif cur is not None and cur not in A:
        A[cur] = dict(t=e['v'], pg=e['pg'], bb=e['bb'])
json.dump({str(k): v for k, v in sorted(A.items())},
          io.open('a_meta.json', 'w', encoding='utf8'), ensure_ascii=False)
print('답지 번호', sum(1 for e in ev if e['k'] == 'n'),
      '· 정답 줄', sum(1 for e in ev if e['k'] == 'a'),
      '· 짝지음', len(A))
