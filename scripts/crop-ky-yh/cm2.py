"""개념+유형(비상) 유형편 공통수학2 → 문항 이미지 + 업로드 자료

표시를 읽는 규칙은 공통수학1용(ev.py/crop.py)과 같다.
 · 문항 번호 : Futura-Condensed 20pt
 · 유형 머리 : '유형' + 번호 + 이름. 같은 칸 안에서만 읽어야 옆 칸 제목이 안 붙는다.
 · 번호가 소단원마다 1번부터 다시 시작 → 1로 돌아가면 새 소단원.
 · 2단 구성. 문항은 **번호 오른쪽부터 그 칸 끝까지**, 다음 번호 위까지 자른다.

유형 코드는 (소단원 순번, 책 유형번호) → 공수2-NN-NN 으로 바로 대응된다.
이 책의 유형 이름이 곧 학원 유형 이름이라 따로 맞출 필요가 없다(개념편과 같은 체계).

쓰는 법
  python scripts/crop-ky-yh/cm2.py --q "<유형편 PDF>" --out "<이미지 폴더>" --json scripts/problems_ky_yh_cm2.json
"""
import argparse
import json
import os
import re

import pymupdf

BOOK = '개념+유형 유형편'
GRADE, SEM = '공통수학2', 1


def spans_of(page):
    return [s for b in page.get_text('dict')['blocks'] if b['type'] == 0
            for l in b.get('lines', []) for s in l['spans'] if s['text'].strip()]


def col_bounds(page):
    """2단 구성의 좌·우 칸 범위를 글자 위치에서 구한다(쪽마다 조금씩 다르다)."""
    W = page.rect.width
    sp = spans_of(page)
    left = [z['bbox'] for z in sp if z['bbox'][0] < W / 2]
    right = [z['bbox'] for z in sp if z['bbox'][0] >= W / 2]
    lo1 = min((b[0] for b in left), default=60) - 4
    hi1 = max((b[2] for b in left), default=W / 2 - 10) + 6
    lo2 = min((b[0] for b in right), default=W / 2 + 10) - 4
    hi2 = max((b[2] for b in right), default=W - 20) + 6
    return [(lo1, min(hi1, W / 2 + 4)), (max(lo2, W / 2 - 4), min(hi2, W - 8))]


def read(doc):
    ev = []
    for i, p in enumerate(doc):
        W = p.rect.width
        sp = spans_of(p)
        for s in sp:
            t = s['text'].strip()
            col = 0 if s['bbox'][0] < W / 2 else 1
            if s['font'].startswith('Futura') and s['size'] > 17 and re.fullmatch(r'\d{1,4}', t):
                ev.append(dict(k='no', pg=i, col=col, y=s['bbox'][1], y1=s['bbox'][3],
                               x1=s['bbox'][2], no=int(t)))
            elif t == '유형':
                y = (s['bbox'][1] + s['bbox'][3]) / 2
                lim = (W / 2 - 10) if col == 0 else W
                row = sorted([z for z in sp if abs((z['bbox'][1] + z['bbox'][3]) / 2 - y) < 7
                              and z['bbox'][0] > s['bbox'][2] and z['bbox'][0] < lim],
                             key=lambda z: z['bbox'][0])
                num = ''.join(z['text'].strip() for z in row if z['text'].strip().isdigit())
                ti = ''.join(z['text'].strip() for z in row if not z['text'].strip().isdigit())
                if ti and num.isdigit():
                    ev.append(dict(k='head', pg=i, col=col, y=s['bbox'][1], no=int(num), t=ti))
    ev.sort(key=lambda e: (e['pg'], e['col'], e['y']))
    return ev


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--q', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--json', required=True)
    a = ap.parse_args()

    doc = pymupdf.open(a.q)
    ev = read(doc)

    units, cur = [], None
    for e in ev:
        if e['k'] == 'head':
            cur = e
        elif e['k'] == 'no':
            if e['no'] == 1 or not units:
                units.append([])
            units[-1].append((e, cur))

    nums = [e for e in ev if e['k'] == 'no']
    pos = {(e['pg'], e['col'], e['y']): i for i, e in enumerate(nums)}

    rows, made = [], 0
    for si, items in enumerate(units, 1):
        d = os.path.join(a.out, '%s-%d' % (GRADE, SEM), 'KYYH', '%02d' % si)
        os.makedirs(d, exist_ok=True)
        for e, head in items:
            i = pos[(e['pg'], e['col'], e['y'])]
            nxt = nums[i + 1] if i + 1 < len(nums) else None
            same = nxt and nxt['pg'] == e['pg'] and nxt['col'] == e['col']
            bot = (nxt['y'] - 6) if same else doc[e['pg']].rect.height - 34
            lo, hi = col_bounds(doc[e['pg']])[e['col']]
            # 번호는 칸 왼쪽에 따로 붙어 있다 → 번호 오른쪽부터 자른다
            x0 = max(lo, e['x1'] + 2)
            if bot - (e['y'] - 4) < 12 or hi - x0 < 40:
                continue
            local = '%02d%03d' % (si, e['no'])
            doc[e['pg']].get_pixmap(matrix=pymupdf.Matrix(2.6, 2.6),
                                    clip=pymupdf.Rect(x0, e['y'] - 4, hi, bot)) \
                .save(os.path.join(d, '%s.png' % local))
            tno = head['no'] if head else 1
            rows.append(dict(b=BOOK, g=GRADE, s=SEM, n=si, t='', l=local,
                             c='공수2-%02d-%02d' % (si, tno), d=None, p='유형편',
                             e=False, v=False, i=False, x='png',
                             dir='%s-%d/KYYH/%02d' % (GRADE, SEM, si),
                             lv=3, pg=e['pg'] + 1, k='image', a=None))
            made += 1
        print('  소단원 %2d: %d문항' % (si, len(items)))

    json.dump(rows, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
    print('✓ 문항 %d개 → %s' % (made, a.json))


if __name__ == '__main__':
    main()
