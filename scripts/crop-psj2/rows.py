"""풍산자 필수유형 공통수학2 — 업로드용 자료를 만든다."""
import io
import json
import os
import re
import shutil
from collections import Counter

M = json.load(io.open('q_meta.json', encoding='utf8'))
A = json.load(io.open('a_meta.json', encoding='utf8'))
D = json.load(io.open('diff.json', encoding='utf8'))
TM = json.load(io.open('typemap.json', encoding='utf8'))
PER = json.load(io.open('permap.json', encoding='utf8'))
APP = json.load(io.open('apptypes.json', encoding='utf8'))
TITLE = {a['sub_chapter_no']: a['sub_chapter_title'] for a in APP}
code = {(r['ch'], r['no']): r['code'] for r in TM}
LV = {'하': 2, '중': 3, '상': 4}

rows = []
miss = []
for m in M:
    n = m['no']
    if m['sec'] == '유형':
        c = code.get((m['bch'], m['btype']))
    else:
        c = (PER.get(str(n)) or {}).get('code')
    if not c:
        miss.append(n)
        continue
    sub = int(c.split('-')[1])
    d = D.get(str(n))
    lv = LV.get(d, 3) if m['sec'] == '유형' else (3 if m['sec'] == '서술형' else 4)
    t = A[str(n)]['t'].strip()
    if re.fullmatch(r'[①②③④⑤]', t):
        k, a = 'choice', t
    elif re.fullmatch(r'-?\d+', t):
        k, a = 'number', t
    else:
        k, a = 'image', None
    rows.append(dict(b='풍산자 필수유형', g='공통수학2', s=1, n=sub, t=TITLE[sub],
                     l=f'{n:03d}', c=c, d=d, p=m['sec'],
                     e=m['sec'] == '서술형', v=False, i=False, x='png',
                     dir=f'공통수학2-1/풍산자 필수유형/{sub:02d}', lv=lv, k=k, a=a,
                     pg=m['pg'] + 1))
print('행', len(rows), '· 유형 못 정함', miss)
print('구간', dict(Counter(r['p'] for r in rows)), '· 레벨', dict(Counter(r['lv'] for r in rows)))
print('정답종류', dict(Counter(r['k'] for r in rows)))
print('소단원별', dict(sorted(Counter(r['n'] for r in rows).items())))
print('쓰인 유형', len({r['c'] for r in rows}))
assert len({(r['n'], r['l']) for r in rows}) == len(rows)
json.dump(rows, io.open('problems_psj_hc2.json', 'w', encoding='utf8'), ensure_ascii=False)

root = 'upload'
shutil.rmtree(root, ignore_errors=True)
cq = ca = 0
for r in rows:
    d2 = os.path.join(root, *r['dir'].split('/'))
    os.makedirs(d2, exist_ok=True)
    shutil.copy(f"out/q/{r['l']}.png", os.path.join(d2, f"{r['l']}.png"))
    cq += 1
    ap = f"out/a/{r['l']}_a.png"
    if os.path.exists(ap):
        shutil.copy(ap, os.path.join(d2, f"{r['l']}).png"))
        ca += 1
print('문제 그림', cq, '· 정답 그림', ca)
