"""문항마다 본문 글자를 뽑는다 (자르기와 같은 경계로).

고득점·서술형은 책에 유형 번호가 없다. 글자가 있는 교재이므로 **유형 구간의 문항과
본문을 견주어** 가장 닮은 것의 유형을 물려주면 손으로 190개를 정하지 않아도 된다.
"""
import io
import json
import re
import pymupdf

q = pymupdf.open('q.pdf')
FOOT = 790


def cols(pi, p):
    xs = [round(d['rect'].x0) for d in p.get_drawings()
          if d['rect'].width < 2 and d['rect'].height > 300]
    div = xs[0] if xs else (315 if pi % 2 == 1 else 323)
    L0 = 62 if pi % 2 == 1 else 71
    w = div - L0
    return [(L0 - 6, div - 4), (div + 11, div + 15 + w)]


marks = []
for pi, p in enumerate(q):
    sp = [s for b in p.get_text('dict')['blocks'] for l in b.get('lines', []) for s in l['spans']]
    grp = {}
    for x in sp:
        if 'Leferi' in x['font'] and x['size'] > 14:
            grp.setdefault((round(x['bbox'][1]), x['bbox'][0] > 300), []).append(x)
    for (y, right), ss in grp.items():
        ss.sort(key=lambda z: z['bbox'][0])
        t = ''.join(z['text'] for z in ss).strip()
        if re.fullmatch(r'\d{3}', t):
            marks.append(dict(k='num', no=int(t), pg=pi, col=int(right),
                              y0=ss[0]['bbox'][1], y1=ss[0]['bbox'][3]))
    for x in sp:
        t = x['text'].strip()
        if t == '풀이' and x['size'] < 11:
            marks.append(dict(k='stop', pg=pi, col=int(x['bbox'][0] > 300),
                              y0=x['bbox'][1] - 2, y1=x['bbox'][3]))
marks.sort(key=lambda m: (m['pg'], m['col'], m['y0']))

T = {}
for i, m in enumerate(marks):
    if m['k'] != 'num':
        continue
    nxt = FOOT
    for n in marks[i + 1:]:
        if n['pg'] != m['pg'] or n['col'] != m['col']:
            break
        nxt = n['y0']
        break
    x0, x1 = cols(m['pg'], q[m['pg']])[m['col']]
    r = pymupdf.Rect(x0, m['y1'] + 2, x1, nxt - 2)
    T[m['no']] = re.sub(r'\s+', ' ', q[m['pg']].get_text(clip=r)).strip()
json.dump({str(k): v for k, v in sorted(T.items())},
          io.open('qtext.json', 'w', encoding='utf8'), ensure_ascii=False)
print('본문 뽑은 문항', len(T), '· 평균 글자수', round(sum(len(v) for v in T.values()) / len(T)))
print('예시 001:', T[1][:80])
print('예시 800:', T[800][:80])
