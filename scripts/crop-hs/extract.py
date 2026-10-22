"""「핵심정리 및 유형별 단계별 교재」(JYJ 수학교실 판)에서 **유형이 붙은 문항만** 뽑는다.

이 교재는 대단원마다 세 구간이다.
  NN-1 핵심정리 및 예제   — 왼쪽은 개념, 오른쪽에 예제. 「개념」 머리말(HYtbrB 12pt)로 묶인다
  NN-2 유형별 문제        — 「유형 01」 배지(HYwulM 14pt 흰 글자) + 제목(HYsupM 12pt)
  NN-3 단계별 문제        — 기초/기본/심화. **유형 표시가 없다** → 여기서 멈춘다

  ★ 유형 배지 글자는 10번부터 「010」 「018」 처럼 앞에 0 이 하나 더 붙는다.
    `\d{1,2}` 로만 보면 유형 10번 이후를 통째로 놓친다.

지면
  · 문제 번호 : Haansoft Batang 16pt 검정, 「51.」
  · 섹션 제목 : HYsupM 18pt 「01-2. 기본도형 유형별 문제」
  · 단계 배지 : H2hdrM 8pt 기초/기본/심화
  · 빠른정답 : 뒤쪽에 「1.」 + 오른쪽에 답 (Haansoft Batang 11.5pt)

쓰는 법
  python scripts/crop-hs/extract.py "<교재.pdf>" <나갈폴더>
"""
import json
import os
import re
import sys

import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'crop-rpm'))
from eqfont import decode_text   # noqa: E402

MID = 364
TOP, BOTTOM = 92, 960


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

    # 단계별 구간이 시작되는 쪽 → 그 앞까지만 쓴다
    stop = len(d)
    for pi, ls in enumerate(pages):
        if any(l['font'] == 'H2hdrM' and abs(l['size'] - 8) < 0.6
               and l['text'] in ('기초', '기본', '발전', '심화') for l in ls):
            stop = pi
            break

    items, allmarks = [], []
    sec, typ = None, None
    for pi in range(stop):
        marks = []
        ls = pages[pi]
        for l in ls:
            t, bb, sz, fn = l['text'], l['bbox'], l['size'], l['font']
            if fn == 'HYsupM' and abs(sz - 18) < 0.6:
                marks.append(('sec', bb, t))
            elif fn == 'HYwulM' and abs(sz - 14) < 0.6 and re.fullmatch(r'0(\d{1,2})', t):
                ttl = next((m['text'] for m in ls
                            if abs(m['bbox'][1] - bb[1]) < 12 and m['bbox'][0] > bb[0] + 20
                            and m['font'] == 'HYsupM'), '')
                marks.append(('type', bb, (int(t[1:]), decode_text(ttl), '유형별')))
            elif fn == 'HYtbrB' and abs(sz - 12) < 0.6 and re.match(r'^\d{1,2}\.\s*\S', t):
                marks.append(('type', bb, (0, decode_text(re.sub(r'^\d{1,2}\.\s*', '', t)), '예제')))
            elif (fn == 'Haansoft Batang' and abs(sz - 16) < 0.6 and l['color'] == 0
                  and re.fullmatch(r'\d{1,4}\.', t)):
                marks.append(('no', bb, int(t[:-1])))

        marks.sort(key=lambda m: (0 if m[1][0] < MID else 1, m[1][1]))
        for kind, bb, val in marks:
            allmarks.append(dict(page=pi, kind=kind, x=bb[0], y=bb[1], x1=bb[2], y1=bb[3]))
        for kind, bb, val in marks:
            if kind == 'sec':
                sec, typ = val, None
            elif kind == 'type':
                typ = val
            elif kind == 'no':
                items.append(dict(no=val, page=pi, col=0 if bb[0] < MID else 1,
                                  x=bb[0], y=bb[1], sec=sec,
                                  typeNo=typ[0] if typ else None,
                                  typeTitle=typ[1] if typ else None,
                                  kind=typ[2] if typ else None))

    # ── 빠른정답 (책 전체분이 들어 있다 — 쓸 번호만 골라 쓴다) ──────────
    answers = {}
    for pi in range(stop, len(d)):
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
                    if abs(x['bbox'][1] - bb[1]) < 6 and bb[2] < x['bbox'][0] < bb[0] + 170
                    and x['size'] > 5]
            if rest:
                answers[n] = decode_text(''.join(
                    x['text'] for x in sorted(rest, key=lambda x: x['bbox'][0]))).strip()

    # 「심화·서술형」 묶음을 한 문항씩 더 가르려면 글이 필요하다 → 문제 글과 풀이 글을 같이 남긴다
    qtext, stext, cur = {}, {}, None
    for pi in range(stop):
        for l in pages[pi]:
            m = re.match(r'^(\d{1,4})\.(.+)$', l['text'])
            if m and l['size'] < 1.2 and int(m.group(1)) not in qtext:
                qtext[int(m.group(1))] = decode_text(m.group(2)).strip()
    for pi in range(stop, len(d)):
        for l in pages[pi]:
            if any(l['text'].startswith(k) for k in ('JYJ수학교실', 'Du kannst', '중1-2', '내신대비')):
                continue
            m = re.fullmatch(r'(\d{1,4})\.', l['text'])
            if m and abs(l['size'] - 11.5) < 0.6:
                cur = int(m.group(1))
                stext.setdefault(cur, [])
            elif cur and l['size'] > 5:
                stext[cur].append(decode_text(l['text']))
    json.dump(dict(q=qtext, s={k: ' '.join(v)[:400] for k, v in stext.items()}),
              open(os.path.join(out, 'texts.json'), 'w', encoding='utf8'), ensure_ascii=False)

    json.dump(items, open(os.path.join(out, 'items.json'), 'w', encoding='utf8'), ensure_ascii=False)
    json.dump(allmarks, open(os.path.join(out, 'marks.json'), 'w', encoding='utf8'), ensure_ascii=False)
    json.dump(dict(stop=stop, answers=answers),
              open(os.path.join(out, 'answers.json'), 'w', encoding='utf8'), ensure_ascii=False)
    ns = [p['no'] for p in items]
    got = sum(1 for n in ns if n in answers)
    gap = [n for n in range(1, max(ns) + 1) if n not in set(ns)] if ns else []
    print(f'문항 {len(ns)}개 1~{max(ns) if ns else 0}' + (f' 빠짐{gap[:6]}' if gap else ' 빠짐없음')
          + f' · 그중 정답 있음 {got}개 · 단계별 시작 p{stop}')


if __name__ == '__main__':
    main()
