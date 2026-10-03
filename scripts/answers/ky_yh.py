import sys, re, json, collections
import pymupdf
sol = pymupdf.open(sys.argv[1])
START = int(sys.argv[3]) if len(sys.argv) > 3 else 101
pages = []
for i in range(START, sol.page_count):
    p = sol[i]
    sp = [s for b in p.get_text('dict')['blocks'] if b['type'] == 0
          for l in b.get('lines', []) for s in l['spans'] if s['text'].strip()]
    pages.append((i, p.rect.width, sp))

marks = []
for i, W, sp in pages:
    for s in sp:
        t = s['text'].strip()
        if s['font'].startswith('DIN-Bold') and 9.0 <= s['size'] <= 9.6 and re.fullmatch(r'\d{1,4}', t):
            marks.append(dict(pg=i, col=0 if s['bbox'][0] < W/2 else 1,
                              y=(s['bbox'][1]+s['bbox'][3])/2, x0=s['bbox'][0], x1=s['bbox'][2],
                              no=int(t), W=W))
marks.sort(key=lambda e: (e['pg'], e['col'], e['y'], e['x0']))
spans = {i: sp for i, W, sp in pages}

units = []
for e in marks:
    if e['no'] == 1 or not units:
        units.append([])
    units[-1].append(e)

out = {}
for si, u in enumerate(units, 1):
    for k, e in enumerate(u):
        nxt = u[k+1] if k+1 < len(u) else None
        same_row = nxt and nxt['pg'] == e['pg'] and nxt['col'] == e['col'] and abs(nxt['y'] - e['y']) < 9
        half = e['W']/2
        lim = (nxt['x0'] - 2) if same_row else ((half - 8) if e['col'] == 0 else e['W'] - 14)
        row = sorted([z for z in spans[e['pg']]
                      if abs((z['bbox'][1]+z['bbox'][3])/2 - e['y']) < 6
                      and z['bbox'][0] >= e['x1'] - 1 and z['bbox'][2] <= lim + 2],
                     key=lambda z: z['bbox'][0])
        txt = ''.join(z['text'] for z in row).strip()
        out['%02d%03d' % (si, e['no'])] = txt
print('뽑은 정답', len(out))
c = collections.Counter()
for v in out.values():
    c['빈칸' if not v else ('동그라미' if re.fullmatch(r'[①-⑩](\s*,\s*[①-⑩])*', v) else
       ('숫자' if re.fullmatch(r'-?\d+(\.\d+)?', v) else '식·기타'))] += 1
print(dict(c))
for k in list(out)[:10]: print('  %s → %r' % (k, out[k][:26]))
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
