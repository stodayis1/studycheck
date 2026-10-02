"""개념+유형(비상) 개념편 공통수학2 → **필수예제**만 빠르게 문항 이미지 + 업로드 자료

공통수학1용(ev/crop/ans/exans/rows.py)과 표시를 읽는 규칙은 같다. 다만 원장님이
"내일 대표예제만 뽑아 풀린다"고 하셔서, 유제(문제)는 빼고 **예제 126개만** 먼저 만든다.
유제는 나중에 같은 규칙으로 덧붙이면 된다.

책 구조 (공통수학1과 동일)
  · 필수예제  : 제목이 곧 유형 이름. 문제 아래 「풀이」 상자가 모범답안이다.
  · 예제 번호가 중단원마다 01부터 다시 시작 → 번호가 01로 돌아가면 새 소단원으로 본다.
  · 본문 칸만 자른다(x 150~536). 왼쪽 '공략 Point' 칸과 번호는 뺀다.

쓰는 법
  python scripts/crop-ky-gn/cm2.py --q "<개념편 PDF>" --out "<이미지 폴더>" --json scripts/problems_ky_gn_cm2.json
"""
import argparse
import json
import os
import re

import pymupdf

X0, X1 = 150, 536
BOOK = '개념+유형 개념편'
GRADE, SEM = '공통수학2', 1


def markers(doc):
    ev = []
    for i, p in enumerate(doc):
        sp = [s for b in p.get_text('dict')['blocks'] if b['type'] == 0
              for l in b.get('lines', []) for s in l['spans'] if s['text'].strip()]
        for s in sp:
            t, f = s['text'].strip(), s['font']
            y0, y1 = s['bbox'][1], s['bbox'][3]
            if f.startswith('YDVYheadL') and s['size'] > 20 and re.fullmatch(r'\d{2}', t):
                ti = ''.join(z['text'] for z in sorted(
                    [z for z in sp if z['font'].startswith(('RixSinGoRound', 'NPBIE', 'NPYB', 'YDVYMjO14'))
                     and abs(z['bbox'][1] - y0) < 22 and z['bbox'][0] > 140],
                    key=lambda z: (round(z['bbox'][1]), z['bbox'][0])))
                ev.append(dict(k='ex', no=int(t), pg=i, y0=y0, y1=y1, title=ti.strip()))
            elif t == '풀이' and f.startswith('RixRakSans'):
                ev.append(dict(k='sol', pg=i, y0=y0, y1=y1))
            elif f.startswith('YDVYheadL') and 8.5 < s['size'] < 9.5 and re.fullmatch(r'\d{2}', t.replace(' ', '')):
                ev.append(dict(k='pr', pg=i, y0=y0, y1=y1))
            elif f.startswith('RixRakSansRoun') and s['size'] >= 16 and len(t) > 2:
                ev.append(dict(k='mid', pg=i, y0=y0, y1=y1, t=t))
            elif f.startswith('BalooBhaina') and t in ('Check', 'Plus'):
                ev.append(dict(k=t.lower(), pg=i, y0=y0, y1=y1))
    ev.sort(key=lambda e: (e['pg'], e['y0']))
    return ev


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--q', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--json', required=True)
    a = ap.parse_args()

    doc = pymupdf.open(a.q)
    ev = markers(doc)
    exs = [e for e in ev if e['k'] == 'ex']

    # 번호가 01로 돌아가면 새 소단원
    units, cur = [], None
    for e in ev:
        if e['k'] == 'mid':
            cur = e['t']
        elif e['k'] == 'ex':
            if e['no'] == 1 or not units:
                units.append(dict(name=(cur or '').strip(), items=[]))
            units[-1]['items'].append(e)
    print('소단원 %d · 예제 %d' % (len(units), sum(len(u['items']) for u in units)))

    rows, made = [], 0
    for si, u in enumerate(units, 1):
        name = re.sub(r'[\s(（]+$', '', u['name']).strip() or ('소단원 %d' % si)
        d = os.path.join(a.out, '%s-%d' % (GRADE, SEM), 'KYGN', '%02d' % si)
        os.makedirs(d, exist_ok=True)
        for ti, e in enumerate(u['items'], 1):
            later = [z for z in ev if (z['pg'], z['y0']) > (e['pg'], e['y0'])]
            sol = next((z for z in later if z['k'] == 'sol'), None)
            foot = doc[e['pg']].rect.height - 40
            bot = (sol['y0'] - 10) if (sol and sol['pg'] == e['pg']) else foot
            local = '%02d%02d' % (si, ti)

            if bot - (e['y1'] + 6) > 12:
                doc[e['pg']].get_pixmap(matrix=pymupdf.Matrix(2.6, 2.6),
                                        clip=pymupdf.Rect(X0, e['y1'] + 6, X1, bot)) \
                    .save(os.path.join(d, '%s.png' % local))
            else:
                continue

            # 정답 = 책에 인쇄된 「풀이」 상자. 다음 표시 앞까지.
            if sol:
                after = [z for z in ev if (z['pg'], z['y0']) > (sol['pg'], sol['y0'])
                         and z['k'] in ('ex', 'pr', 'check', 'plus', 'mid')]
                abot = after[0]['y0'] - 8 if (after and after[0]['pg'] == sol['pg']) \
                    else doc[sol['pg']].rect.height - 40
                if abot - (sol['y0'] - 4) > 12:
                    doc[sol['pg']].get_pixmap(matrix=pymupdf.Matrix(2.6, 2.6),
                                              clip=pymupdf.Rect(X0, sol['y0'] - 4, X1, abot)) \
                        .save(os.path.join(d, '%s).png' % local))

            rows.append(dict(b=BOOK, g=GRADE, s=SEM, n=si, t=name, l=local,
                             c='공수2-%02d-%02d' % (si, ti), d=None, p='필수예제',
                             e=False, v=False, i=True, x='png',
                             dir='%s-%d/KYGN/%02d' % (GRADE, SEM, si),
                             lv=2, pg=e['pg'] + 1, k='image', a=None))
            made += 1
        print('  %2d. %-24s 예제 %d개' % (si, name[:24], len(u['items'])))

    json.dump(rows, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
    print('✓ 예제 %d개 → %s' % (made, a.json))


if __name__ == '__main__':
    main()
