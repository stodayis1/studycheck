# -*- coding: utf-8 -*-
"""RPM 해설 PDF 에서 **「답 …」 부분만 그림으로 떠서** 빠진 정답 그림을 채운다.

  python scripts/answers/rpm_cut_answer.py "<해설 PDF>" <번호목록.json> <나갈폴더> [--zoom 3]

왜 글자로 안 옮기고 그림으로 뜨나
  해설의 수식은 글자 층에 `2Ü`_5Û``·`;2!;`·`'¶31` 처럼 **출판사 전용 글자**로 들어 있다.
  이걸 사람이 읽을 글자로 옮기려면 표를 짜야 하고, 한 글자만 틀려도 학생이 **틀린 답**을 본다.
  해설 지면을 그대로 떠 오면 **옮겨 적는 일이 없으니 틀릴 일도 없다.**
  (번호 251개 중 100개만 「답」 글자를 뽑을 수 있었는데, 그림은 그보다 많이 뜰 수 있다.)

어디를 자르나
  번호표(0034) → 그 다음 「답」 → **그 줄부터 같은 단에서 다음 번호표·다음 답이 나오기 전까지.**
  분수는 분자·분모가 두 줄이라 한 줄만 뜨면 반쪽이 된다. 그래서 줄이 아니라 **구간**을 뜬다.

번호목록.json 은 ["0002","0004",…] 또는 [{"no":"0002"},…] 꼴.
"""
import io
import json
import os
import re
import sys

import pymupdf

src, want_p, out = sys.argv[1:4]
zi = sys.argv.index('--zoom') if '--zoom' in sys.argv else -1
ZOOM = float(sys.argv[zi + 1]) if zi > 0 else 3.0
os.makedirs(out, exist_ok=True)

raw = json.load(io.open(want_p, encoding='utf8'))
want = {r if isinstance(r, str) else r['no'] for r in raw}

NO = re.compile(r'^(\d{4})(?:\s|$)')
doc = pymupdf.open(src)
made = {}


def lines_of(page):
    """줄 단위로 모은다 — 번호는 '000'+'1' 처럼 **두 조각으로 쪼개져** 있어서 스팬으론 못 찾는다."""
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b.get('lines', []):
            sp = [s for s in l['spans'] if s['text'].strip()]
            if not sp:
                continue
            x0 = min(s['bbox'][0] for s in sp); x1 = max(s['bbox'][2] for s in sp)
            y0 = min(s['bbox'][1] for s in sp); y1 = max(s['bbox'][3] for s in sp)
            out.append(dict(x0=x0, x1=x1, y0=y0, y1=y1, sp=sp,
                            t=''.join(s['text'] for s in sp).strip()))
    return out


def cut_at_gap(line, gap=18.0):
    """「답 …」 오른쪽에 **넓은 빈칸**을 두고 해설이 붙어 있다. 그 빈칸에서 끊는다."""
    sp = sorted(line['sp'], key=lambda z: z['bbox'][0])
    x1 = sp[0]['bbox'][2]
    for a, b in zip(sp, sp[1:]):
        if b['bbox'][0] - a['bbox'][2] > gap:
            return x1
        x1 = b['bbox'][2]
    return x1


for pi in range(doc.page_count):
    page = doc[pi]
    L = lines_of(page)
    marks = [l for l in L if NO.match(l['t'])]
    if not marks:
        continue
    # 지면은 쪽마다 단 수가 다르다(앞쪽 빠른정답은 4단, 풀이 쪽은 2단).
    # 번호표가 선 x 자리를 모아 **그 쪽의 단**으로 삼는다.
    cols = []
    for m in sorted(marks, key=lambda z: z['x0']):
        if not cols or m['x0'] - cols[-1] > 30:
            cols.append(m['x0'])
    def colx(x):
        c = max([c for c in cols if x >= c - 12], default=cols[0])
        return c
    right = {c: (cols[i + 1] - 6 if i + 1 < len(cols) else page.rect.x1 - 6) for i, c in enumerate(cols)}

    # 쪽 옆에 세로로 선 띠(「정수와 유리수」)는 뺀다 — 지면 맨 오른쪽에 붙어 있다
    L = [l for l in L if l['x0'] < page.rect.x1 - 32]
    answers = [l for l in L if l['t'].startswith('답')]

    for m in marks:
        no = NO.match(m['t']).group(1)
        if no not in want or no in made:
            continue
        c = colx(m['x0'])
        # ① 같은 줄 오른쪽에 「답」이 있나 (앞쪽 빠른정답 쪽은 격자라 번호와 답이 한 줄이다)
        row = [a for a in answers if a['x0'] > m['x1'] - 2 and abs(a['y0'] - m['y0']) < 12
               and colx(a['x0']) == c]
        if row:
            ans = min(row, key=lambda z: z['x0'])
        else:
            # ② 아니면 같은 단에서 아래로 — 단, **사이에 다른 번호표가 끼면 그 답은 남의 것**이다
            below = [a for a in answers if colx(a['x0']) == c and a['y0'] > m['y0'] + 2]
            if not below:
                continue
            ans = min(below, key=lambda z: z['y0'])
            between = [x for x in marks if colx(x['x0']) == c and m['y0'] + 2 < x['y0'] < ans['y0'] - 2]
            if between:
                continue
        # 끝: 같은 단에서 다음 번호표나 다음 답이 시작하는 자리
        after = [l for l in L if colx(l['x0']) == c and l['y0'] > ans['y0'] + 2
                 and (NO.match(l['t']) or l['t'].startswith('답'))]
        stop = min([l['y0'] for l in after], default=page.rect.y1) - 2
        near = sorted([l for l in L if colx(l['x0']) == c
                       and ans['x0'] - 2 <= l['x0'] <= ans['x0'] + 40
                       and ans['y0'] - 3 <= l['y0'] < stop], key=lambda z: z['y0'])
        # 답에 **붙어 있는 줄**까지만 — 분수는 분모가 바로 아래 한 줄로 오고,
        # 그 아래 떨어져 있는 풀이 문장은 답이 아니다.
        band = []
        for l in near:
            if band and l['y0'] - band[-1]['y1'] > 8:
                break
            band.append(l)
        if not band:
            continue
        x0 = max(ans['x0'] - 3, 0)                      # **번호는 빼고 「답」부터**
        x1 = min(max(cut_at_gap(l) for l in band) + 3, right[c])
        y0 = ans['y0'] - 4
        y1 = min(stop, max(l['y1'] for l in band) + 3)
        if y1 - y0 < 6 or x1 - x0 < 10:
            continue
        page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM),
                        clip=pymupdf.Rect(x0, y0, x1, y1)).save(os.path.join(out, f'{no}.png'))
        made[no] = dict(page=pi + 1, h=round(y1 - y0, 1), w=round(x1 - x0, 1))

# 2차 — 1차로 못 뜬 것. 풀이가 길면 **답이 다음 단·다음 쪽으로 넘어간다.**
# 그래서 문서 전체를 한 줄로 이어 놓고 번호표 → 바로 다음 「답」 으로 짝짓는다.
seq = []                                   # (쪽, 줄) — 쪽 차례 · 쪽 안에서는 글자 뽑힌 차례
pages = {}
for pi in range(doc.page_count):
    page = doc[pi]
    L = [l for l in lines_of(page) if l['x0'] < page.rect.x1 - 32]
    pages[pi] = L
    for l in L:
        if NO.match(l['t']) or l['t'].startswith('답'):
            seq.append((pi, l))

for k, (pi, l) in enumerate(seq):
    m = NO.match(l['t'])
    if not m:
        continue
    no = m.group(1)
    if no not in want or no in made:
        continue
    if k + 1 >= len(seq):
        continue
    pj, ans = seq[k + 1]
    if NO.match(ans['t']):                 # 다음이 또 번호표 → 이 번호의 답을 못 찾았다
        continue
    page = doc[pj]
    L = pages[pj]
    after = [x for x in L if x['y0'] > ans['y0'] + 2 and x['x0'] > ans['x0'] - 40
             and (NO.match(x['t']) or x['t'].startswith('답'))]
    stop = min([x['y0'] for x in after], default=page.rect.y1) - 2
    near = sorted([x for x in L if ans['x0'] - 2 <= x['x0'] <= ans['x0'] + 40
                   and ans['y0'] - 3 <= x['y0'] < stop], key=lambda z: z['y0'])
    band = []
    for x in near:
        if band and x['y0'] - band[-1]['y1'] > 8:
            break
        band.append(x)
    if not band:
        continue
    x0 = max(ans['x0'] - 3, 0)
    x1 = min(max(cut_at_gap(x) for x in band) + 3, page.rect.x1 - 6)
    y0 = ans['y0'] - 4
    y1 = min(stop, max(x['y1'] for x in band) + 3)
    if y1 - y0 < 6 or x1 - x0 < 10:
        continue
    page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM),
                    clip=pymupdf.Rect(x0, y0, x1, y1)).save(os.path.join(out, f'{no}.png'))
    made[no] = dict(page=pj + 1, h=round(y1 - y0, 1), w=round(x1 - x0, 1), way='차례')

miss = sorted(want - set(made))
json.dump(made, io.open(os.path.join(out, '_뜬것.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(f'찾던 번호 {len(want)} · 그림으로 뜬 것 {len(made)} · 못 뜬 것 {len(miss)}')
if miss:
    print('  못 뜬 번호:', ' '.join(miss[:20]) + (' …' if len(miss) > 20 else ''))
print(f'→ {out}')
print('※ 올리기 전에 **눈으로 볼 것** — 옆 문항이 딸려 들어왔는지, 반쪽만 떴는지.')
