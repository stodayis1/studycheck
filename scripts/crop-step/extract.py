"""「기출 단계별 교재」(JYJ 수학교실 판) 한 권에서 문항 구조와 빠른정답을 뽑는다.

지면 (728×1031, 2단)
  · 문제 번호  : Haansoft Batang 16pt, 남색(1644825), 「1.」
  · 유형 배지  : 흰 글자 번호(HYwulM 14pt) + 오른쪽에 제목(HYsupM 12pt)
  · 대단원 띠  : HYsupM 14pt  (기본 도형 / 위치 관계 / 평행선의 성질 …)
  · 단계 배지  : H2hdrM 8pt — 기초 / 기본 / 발전 / 심화 / 유형별
  · 빠른정답   : 뒤쪽에 「1. 정답 ④」 가 쭉 이어진 쪽
  · 해설       : 그 뒤에 「1. 정답 ④  풀이 …」

쓰는 법
  python scripts/crop-step/extract.py "<교재.pdf>" <나갈폴더>
  결과: items.json · marks.json · answers.json
"""
import json
import os
import re
import sys

import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'crop-rpm'))
from eqfont import decode_text   # noqa: E402

TOP, BOTTOM = 92, 960
MID = 364
NUM_SIZE, NUM_COLOR = 16.0, 1644825


def lines_of(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b['lines']:
            t = ''.join(s['text'] for s in l['spans'])
            if not t.strip():
                continue
            s0 = l['spans'][0]
            out.append(dict(bbox=l['bbox'], text=t.strip(), size=s0['size'],
                            font=s0['font'], color=s0['color']))
    return out


def main():
    pdf, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    d = pymupdf.open(pdf)
    pages = [lines_of(d[pi]) for pi in range(len(d))]

    # 빠른정답이 시작되는 쪽 = 「정답」 배지(HYsupM 7pt)가 처음 나오는 쪽
    first_ans = len(d)
    for pi, ls in enumerate(pages):
        if any(l['font'] == 'HYsupM' and abs(l['size'] - 7) < 0.6 and l['text'] == '정답' for l in ls):
            first_ans = pi
            break

    items, allmarks = [], []
    band, typ, step = None, None, None
    for pi in range(first_ans):
        ls = pages[pi]
        marks = []
        for l in ls:
            t, bb, sz, fn = l['text'], l['bbox'], l['size'], l['font']
            if fn == 'H2hdrM' and abs(sz - 8) < 0.6 and t in ('기초', '기본', '발전', '심화', '유형별'):
                marks.append(('step', bb, t))
            elif fn == 'HYsupM' and abs(sz - 14) < 0.6 and bb[1] < 170:
                marks.append(('band', bb, t))
            elif fn == 'HYwulM' and abs(sz - 14) < 0.6 and re.fullmatch(r'\d{1,2}', t):
                ttl = next((m['text'] for m in ls
                            if abs(m['bbox'][1] - bb[1]) < 12 and m['bbox'][0] > bb[0] + 20
                            and m['font'] == 'HYsupM'), '')
                marks.append(('type', bb, (int(t), decode_text(ttl))))
            elif (fn == 'Haansoft Batang' and abs(sz - NUM_SIZE) < 0.6
                  and l['color'] == NUM_COLOR and re.fullmatch(r'\d{1,4}\.', t)):
                marks.append(('no', bb, int(t[:-1])))

        marks.sort(key=lambda m: (0 if m[1][0] < MID else 1, m[1][1]))
        for kind, bb, val in marks:
            allmarks.append(dict(page=pi, kind=kind, x=bb[0], y=bb[1], x1=bb[2], y1=bb[3]))
        for kind, bb, val in marks:
            if kind == 'step':
                step = val
            elif kind == 'band':
                band = val
            elif kind == 'type':
                typ = val
            elif kind == 'no':
                items.append(dict(no=val, page=pi, col=0 if bb[0] < MID else 1,
                                  x=bb[0], y=bb[1], band=band, step=step,
                                  typeNo=typ[0] if typ else None,
                                  typeTitle=typ[1] if typ else None))

    # ── 빠른정답 ──────────────────────────────────────────────────
    answers = {}
    for pi in range(first_ans, len(d)):
        ls = pages[pi]
        for l in ls:
            m = re.fullmatch(r'(\d{1,4})\.', l['text'])
            if not (m and l['font'] == 'Haansoft Batang' and abs(l['size'] - 11.5) < 0.6):
                continue
            n = int(m.group(1))
            if n in answers:
                continue
            bb = l['bbox']
            rest = [x for x in ls
                    if abs(x['bbox'][1] - bb[1]) < 5 and x['bbox'][0] > bb[2]
                    and x['text'] != '정답' and x['bbox'][0] < bb[0] + 150]
            if rest:
                answers[n] = decode_text(''.join(x['text'] for x in sorted(rest, key=lambda x: x['bbox'][0]))).strip()

    json.dump(items, open(os.path.join(out, 'items.json'), 'w', encoding='utf8'), ensure_ascii=False)
    json.dump(allmarks, open(os.path.join(out, 'marks.json'), 'w', encoding='utf8'), ensure_ascii=False)
    json.dump(dict(first_ans=first_ans, answers=answers),
              open(os.path.join(out, 'answers.json'), 'w', encoding='utf8'), ensure_ascii=False)

    ns = [p['no'] for p in items]
    gap = [n for n in range(1, max(ns) + 1) if n not in set(ns)] if ns else []
    print(f'문항 {len(ns)}개 1~{max(ns) if ns else 0}' + (f' 빠짐{gap[:8]}' if gap else ' 빠짐없음')
          + f' · 빠른정답 {len(answers)}개 · 문제쪽 0~{first_ans - 1}')


if __name__ == '__main__':
    main()
