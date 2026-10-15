"""일품(한글→PDF) 한 대단원에서 문항 구조를 뽑는다.

RPM 한글판과 같은 제작사 판형(728×1031, 2단)이지만 표시가 다르다.
  · 문제 번호  : HYwulB 14pt. 「16 16.…」 처럼 글과 한 줄일 때도, 「1」 처럼 번호만일 때도 있다
  · 소단원     : 쪽 머리말 「11-다각형」 (HYwulM/HYsupB 20pt)
  · 개념&핵심기출 : 「개념 01」 상자 머리말 (HYwulB 12pt)
  · 만점도전 고난도 : 「개념 01」 은띠 배너 (ExpoM-HM 12pt)  ← 같은 개념 번호를 다시 쓴다
  · 정답       : 「1. 답 ③」 (Haansoft Batang 11pt) 바로 아래 「[해설]」
  · 대단원마무리 파일은 번호가 HYwulM 15pt 이고 [Level 1]/[Level 2] 로 나뉜다

쓰는 법
  python scripts/crop-ilpum/extract.py "<대단원.pdf>" <나갈폴더>
  결과: <나갈폴더>/items.json · marks.json
"""
import json
import os
import re
import sys

import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'crop-rpm'))
from eqfont import decode_text   # noqa: E402

TOP, BOTTOM = 66, 962     # 머리말·꼬리말을 뺀 본문의 세로 범위
MID = 364


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
    # 해설 구간부터는 번호가 1부터 다시 시작한다 → 그 앞까지만 본다
    first_ans = len(d)
    for pi in range(len(d)):
        if any(re.match(r'^\d{1,3}\.\s*답', l['text']) for l in lines_of(d[pi])):
            first_ans = pi
            break

    items, allmarks = [], []
    sub, subtitle, concept, sec, level = None, None, None, '핵심기출', None

    for pi in range(first_ans):
        ls = lines_of(d[pi])
        marks = []
        for l in ls:
            t, bb, sz, fn = l['text'], l['bbox'], l['size'], l['font']
            if fn in ('HYwulM', 'HYsupB') and abs(sz - 20) < 0.6 and re.match(r'^(\d{1,2})-', t):
                marks.append(('sub', bb, t))
            elif fn == 'HYwulB' and abs(sz - 12) < 0.6 and re.match(r'^개념\s*(\d{1,2})', t):
                ttl = next((m['text'] for m in ls
                            if abs(m['bbox'][1] - bb[1]) < 6 and m['bbox'][0] > bb[0] + 40), '')
                marks.append(('개념', bb, (int(re.findall(r'\d+', t)[0]), decode_text(ttl), '핵심기출')))
            elif fn == 'ExpoM-HM' and abs(sz - 12) < 0.6 and re.match(r'^개념\s*(\d{1,2})', t):
                ttl = next((m['text'] for m in ls
                            if abs(m['bbox'][1] - bb[1]) < 6 and m['bbox'][0] > bb[0] + 40), '')
                marks.append(('개념', bb, (int(re.findall(r'\d+', t)[0]), decode_text(ttl), '고난도')))
            elif re.fullmatch(r'\d{1,2}\.', t) and sz >= 13.4:
                # 「교과서 속 창의유형」의 「유형 1,」 딱지. 「유형」 은 그림이라 숫자만 남는다.
                marks.append(('창의', bb, int(t[:-1])))
            elif abs(sz - 16) < 1.2 and re.match(r'^\[Level\s*(\d)\]', t):
                marks.append(('level', bb, int(re.findall(r'\d', t)[0])))
            elif (fn in ('HYwulB', 'HYwulM') and 13.4 <= sz <= 15.6
                  and TOP <= bb[1] <= BOTTOM):
                m = re.match(r'^(\d{1,3})(?:\s|\.|$)', t)
                if m:
                    marks.append(('no', bb, int(m.group(1))))

        marks.sort(key=lambda m: (0 if m[1][0] < MID else 1, m[1][1]))
        for kind, bb, val in marks:
            allmarks.append(dict(page=pi, kind=kind, x=bb[0], y=bb[1], x1=bb[2], y1=bb[3]))
        for kind, bb, val in marks:
            if kind == 'sub':
                n, _, title = val.partition('-')
                # 「2-정수와 유리수」 같은 딴 단원 머리말이 칸막이 쪽에 남아 있다 — 건너뛴다
                if sub is None or int(n) >= sub:
                    sub, subtitle = int(n), title
            elif kind == '개념':
                concept, _, sec = val[0], val[1], val[2]
            elif kind == 'level':
                level, sec = val, f'Level{val}'
            elif kind == '창의':
                sec, concept = '창의유형', None
            elif kind == 'no':
                items.append(dict(no=val, page=pi, col=0 if bb[0] < MID else 1,
                                  x=bb[0], y=bb[1], sub=sub, subtitle=subtitle,
                                  concept=concept, sec=sec, level=level))

    json.dump(items, open(os.path.join(out, 'items.json'), 'w', encoding='utf8'), ensure_ascii=False)
    json.dump(allmarks, open(os.path.join(out, 'marks.json'), 'w', encoding='utf8'), ensure_ascii=False)
    ns = [p['no'] for p in items]
    gap = [n for n in range(1, max(ns) + 1) if n not in set(ns)] if ns else []
    print(f'문항 {len(items)}개 · 번호 1~{max(ns) if ns else 0}' + (f' · 빠짐 {gap[:10]}' if gap else ' · 빠짐없음'))


if __name__ == '__main__':
    main()
