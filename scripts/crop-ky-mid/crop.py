"""개념+유형 유형편 라이트(중등) — 문항을 그림으로 자른다.

자르는 규칙
  가로 : 번호 오른쪽부터 **그 단의 오른쪽 끝**까지. 번호는 칸 왼쪽에 따로 붙어 있어서
         번호까지 넣으면 학습지에 교재 번호가 같이 찍힌다.
  세로 : 번호 위 4pt 부터 **같은 단의 다음 번호 위**까지. 다음 번호가 없으면 쪽 아래 여백까지.
  단   : 쪽마다 글자 위치에서 좌·우 단 범위를 구한다(쪽마다 조금씩 다르다).

번호 체계
  유형 문항      : 소단원 2자리 + 유형 2자리 + 번호 2자리  (예: 010203)
  기출·마무리    : 소단원 2자리 + 'E' + 일련번호 3자리     (예: 01E001)
  → 교재에 인쇄된 번호는 소단원마다 1부터 다시 시작해서 그대로 쓸 수 없다.

쓰는 법
  python scripts/crop-ky-mid/crop.py 중3 1 --out "C:/Users/USER/문제은행/_ky중등" --json scripts/problems_kymid_m31.json
"""
import argparse
import json
import os
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from scan import B, PDFS, spans, read, group, check_order, printed_page  # noqa: E402

BOOK = '개념+유형 유형편 라이트'
ZOOM = 2.6                 # 200dpi 쯤. 다른 개념+유형 자르기와 같은 배율
BOOK_CODE = 'ky_mid'


def col_bounds(page):
    """좌·우 단의 가로 범위를 글자 위치에서 구한다."""
    W = page.rect.width
    sp = spans(page)
    left = [s['bbox'] for s in sp if s['bbox'][0] < W / 2]
    right = [s['bbox'] for s in sp if s['bbox'][0] >= W / 2]
    lo1 = min((b[0] for b in left), default=50) - 4
    hi1 = max((b[2] for b in left), default=W / 2 - 10) + 6
    lo2 = min((b[0] for b in right), default=W / 2 + 10) - 4
    hi2 = max((b[2] for b in right), default=W - 20) + 6
    return [(max(lo1, 20), min(hi1, W / 2 + 6)),
            (max(lo2, W / 2 - 6), min(hi2, W - 14))]


def collect(doc):
    """자를 문항을 읽기 순서대로 — 유형 문항과 기출·마무리를 한 줄로 세운다."""
    ev = read(doc)
    gs, etc = group(ev)
    out = []
    for g in gs:
        for k, e in enumerate(g['items'], 1):
            out.append(dict(e, sub=g['sub'], typeNo=g['typeNo'], title=g['title'],
                            local='%02d%02d%02d' % (g['sub'], g['typeNo'], k)))
    # 기출·마무리는 소단원을 알 수 없으므로, 바로 앞 유형의 소단원을 물려받는다
    sub = 1
    seq = {}
    byid = {(e['pg'], e['col'], e['y']): e for e in ev if e['k'] == 'q'}
    cur = 1
    for e in ev:
        if e['k'] == 't':
            cur = next((g['sub'] for g in gs if g['typeNo'] == e['no'] and e in g['items'] + [e]), cur)
    for e in etc:
        # 그 문항보다 앞에 있던 유형의 소단원
        before = [g for g in gs if g['items'] and (g['items'][0]['pg'], g['items'][0]['y']) <= (e['pg'], e['y'])]
        sub = before[-1]['sub'] if before else 1
        seq[sub] = seq.get(sub, 0) + 1
        out.append(dict(e, sub=sub, typeNo=None, title=None,
                        local='%02dE%03d' % (sub, seq[sub])))
    out.sort(key=lambda e: (e['pg'], e['col'], e['y']))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('grade')
    ap.add_argument('semester', type=int)
    ap.add_argument('--out', required=True)
    ap.add_argument('--json', required=True)
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()

    body, _ = PDFS[(a.grade, a.semester)]
    doc = pymupdf.open(os.path.join(B, body))

    have, back = check_order(doc)
    if back:
        print('✗ 쪽 순서가 책과 다릅니다 — 자르지 않습니다 (%d곳)' % len(back))
        return
    print('%s-%d · PDF %d쪽 · 쪽 순서 확인 OK' % (a.grade, a.semester, len(doc)), flush=True)

    items = collect(doc)
    if a.limit:
        items = items[:a.limit]
    print('  자를 문항 %d개 (유형 %d · 기출마무리 %d)'
          % (len(items), sum(1 for x in items if x['typeNo']), sum(1 for x in items if not x['typeNo'])),
          flush=True)

    course = '%s-%d' % (a.grade, a.semester)
    rows, made, skip = [], 0, 0
    bycol = {}
    for i, e in enumerate(items):
        pg = e['pg']
        if pg not in bycol:
            bycol[pg] = col_bounds(doc[pg - 1])
        lo, hi = bycol[pg][e['col']]
        # 같은 쪽·같은 단의 다음 문항
        nxt = next((n for n in items[i + 1:] if n['pg'] == pg and n['col'] == e['col']), None)
        bot = (nxt['y'] - 6) if nxt else (doc[pg - 1].rect.height - 40)
        top = e['y'] - 4
        x0 = max(lo, e['x1'] + 3)
        if bot - top < 14 or hi - x0 < 45:
            skip += 1
            continue
        d = os.path.join(a.out, course, BOOK_CODE, '%02d' % e['sub'])
        os.makedirs(d, exist_ok=True)
        doc[pg - 1].get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM),
                               clip=pymupdf.Rect(x0, top, hi, bot)) \
            .save(os.path.join(d, '%s.png' % e['local']))
        rows.append(dict(b=BOOK, g=a.grade, s=a.semester, n=e['sub'], t='',
                         l=e['local'], c=None, d=None,
                         p=('유형' if e['typeNo'] else '기출·마무리'),
                         e=False, v=False, i=False, x='png',
                         dir='%s/%s/%02d' % (course, BOOK_CODE, e['sub']),
                         lv=2, pg=printed_page(doc[pg - 1]) or pg,
                         typeNo=e['typeNo'], typeTitle=e['title']))
        made += 1
        if made % 200 == 0:
            print('    %d개' % made, flush=True)
    json.dump(rows, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
    print('  ✓ 자른 문항 %d개 · 너무 작아 건너뜀 %d개 → %s' % (made, skip, a.json))


if __name__ == '__main__':
    main()
