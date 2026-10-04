"""교재 PDF의 글자층에서 **문항 번호 → 교재 쪽**을 읽어 page_no 를 채운다.

왜 또 만드나
  page-map/match.py 는 문항 그림을 쪽 그림에 겹쳐 보는 방식이라 스캔본에도 되지만 느리다.
  공통수학1 교재들은 **글자층이 살아 있다.** 번호를 그냥 읽으면 몇 초면 끝난다.

어떻게
  1) 교재마다 번호 글꼴·크기 규칙이 다르다 (BOOKS 표). 그 규칙에 맞는 글자만 모은다.
  2) 같은 줄에서 가까이 붙은 글자는 한 번호로 잇는다 (0231 이 0·2·3·1 로 쪼개져 올 때가 있다).
  3) 쪽 아래 여백에 인쇄된 쪽번호를 읽어 **offset(인쇄된 쪽 − PDF 쪽)** 을 스스로 잰다.
  4) DB 의 local_no 와 맞춰 page_no 를 넣는다.

쓰는 법 (PowerShell)
  python scripts/page-fill/cm1.py rpm           # 먼저 그냥 돌려 보고
  python scripts/page-fill/cm1.py rpm --write   # 맞으면 저장

  python scripts/page-fill/cm1.py all --write   # 번호가 책 전체로 매겨진 교재 전부
"""
import argparse
import collections
import json
import os
import re
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'page-map'))
from match import load_env, fetch_all, api, utf8_console  # noqa: E402

B = r'C:\Users\USER\Desktop\빅픽쳐\문제은행\고등\공수1'
M = r'C:\Users\USER\문제은행\공수1'

# 교재마다: PDF · 번호 글꼴 · 크기 범위 · 번호 모양 · DB 번호로 바꾸는 법
BOOKS = {
    'rpm': dict(
        book='RPM', pdf=os.path.join(M, r'공통수학1_디딤돌_개념원리 RPM[PDF]', '22개정 RPM 공통수학1 학생용.pdf'),
        font='MyriadPro-Bold', lo=12, hi=14, pat=r'\d{4}', key=lambda t: '%04d' % int(t)),
    'mr': dict(
        book='유형만렙', pdf=os.path.join(M, r'공통수학1_비상_유형만렙(비상)[PDF]', '[비상] 유형만렙 공통수학1(학생용).pdf'),
        font='Hoyoyo', lo=12, hi=99, pat=r'\d{4}', key=lambda t: '%04d' % int(t)),
    'psj': dict(
        book='풍산자 필수유형', pdf=os.path.join(M, '풍산자 필수유형', '풍산자 필수유형_공통수학1(학생용).pdf'),
        font='Leferi', lo=14, hi=99, pat=r'\d{3}', key=lambda t: '%03d' % int(t)),
}
# 번호가 **소단원마다 1부터 다시** 시작하는 교재.
#   읽기 순서로 늘어놓고, 번호가 줄어들면 새 소단원으로 본다.
#   DB 의 local_no 는 소단원 2자리 + 번호 3자리 (예: 01001)
BOOKS_RESET = {
    'kyyh': dict(
        book='개념+유형 유형편',
        pdf=os.path.join(B, '개념서', '개뿔_공통수학1_유형편_학생용.pdf'),
        font='Futura', lo=15, hi=99, pat=r'\d{1,3}', cols=2, gutter=290,
        key=lambda sub, n: '%02d%03d' % (sub, n)),
    'psl': dict(
        book='풍산자 라이트유형',
        pdf=os.path.join(M, '공통수학1_지학사_풍산자 라이트 유형[PDF]', '풍산자_라이트유형_공통수학1_(학생용).pdf'),
        font='Jalnan', lo=13.5, hi=99, pat=r'\d{2,3}', cols=2, gutter=300,
        key=lambda sub, n: '%02d%03d' % (sub, n)),
}

ALL = ['rpm', 'mr', 'psj']
ALL_RESET = ['kyyh', 'psl', 'kygn']


def numbers_in_order(doc, cfg):
    """읽기 순서(쪽 → 단 → 위에서 아래)로 번호를 늘어놓는다."""
    out = []
    for i in range(len(doc)):
        got = []
        for s in spans(doc[i]):
            if cfg['font'] not in s['font']:
                continue
            if not (cfg['lo'] < s['size'] < cfg['hi']):
                continue
            t = s['text'].strip()
            if not re.fullmatch(cfg['pat'], t):
                continue
            col = 1 if (cfg['cols'] == 2 and s['bbox'][0] > cfg['gutter']) else 0
            got.append((col, s['bbox'][1], int(t), i + 1))
        got.sort()
        out += [(n, pg) for _, _, n, pg in got]
    return out


def run_reset(name, write):
    cfg = BOOKS_RESET[name]
    if not os.path.exists(cfg['pdf']):
        print('%s: PDF 없음 — %s' % (cfg['book'], cfg['pdf']))
        return
    rows = fetch_all('/rest/v1/problems', {
        'select': 'id,local_no,page_no', 'book': 'eq.' + cfg['book'],
        'grade': 'eq.공통수학1', 'semester': 'eq.1'})
    want = {str(r['local_no']): r for r in rows}
    doc = pymupdf.open(cfg['pdf'])
    off, votes = measure_offset(doc)
    if off is None:
        off = 0
    print('%s — 문항 %d · PDF %d쪽 · offset %+d' % (cfg['book'], len(rows), len(doc), off), flush=True)

    seqn = numbers_in_order(doc, cfg)
    # 번호로 열쇠를 만들어 맞춰 본다
    found, sub, prev = {}, 0, 10 ** 9
    for n, pg in seqn:
        if n <= prev:
            sub += 1
        prev = n
        found.setdefault(cfg['key'](sub, n), pg + off)
    hit = {k: v for k, v in found.items() if k in want}

    # ★ 책의 중단원과 학원 소단원이 다른 교재가 있다(유형편은 책 18 : 학원 10).
    #   그러면 번호로 만든 열쇠가 안 맞는다. 대신 **개수가 정확히 같을 때만**
    #   읽은 순서와 DB 번호 순서를 1:1 로 짝짓는다. (공통수학2 에서 같은 방법으로 맞췄다)
    if len(hit) < len(rows) and len(seqn) == len(rows):
        order = sorted(want)
        paired = {order[i]: seqn[i][1] + off for i in range(len(order))}
        back2 = sum(1 for i in range(1, len(order))
                    if paired[order[i]] < paired[order[i - 1]])
        print('  번호로 맞춘 것 %d / %d → 순서로 짝지음 (개수 %d = %d, 거꾸로 %d)'
              % (len(hit), len(rows), len(seqn), len(rows), back2))
        if back2 == 0:
            hit = paired
    print('  읽은 번호 %d · 책 기준 소단원 %d개 · 붙일 것 %d / %d (%d%%)'
          % (len(found), sub, len(hit), len(rows), 100 * len(hit) // max(len(rows), 1)))
    seq = [hit[k] for k in sorted(hit)]
    back = sum(1 for j in range(1, len(seq)) if seq[j] < seq[j - 1])
    print('  쪽이 거꾸로인 곳 %d · 쪽 범위 %d~%d (최대 %d)'
          % (back, min(seq) if seq else 0, max(seq) if seq else 0, len(doc) + off))
    if not write:
        print('  (--write 를 붙여야 저장합니다)')
        return
    if len(hit) < len(rows) * 0.9 or back:
        print('  ✗ 맞은 비율이 낮거나 쪽이 거꾸로라 저장하지 않습니다')
        return
    n2 = 0
    for k, pg in hit.items():
        api('/rest/v1/problems', {'id': 'eq.' + str(want[k]['id'])}, method='PATCH',
            data=json.dumps({'page_no': pg}).encode())
        n2 += 1
    print('  저장 %d개' % n2)


def spans(page):
    return [s for b in page.get_text('dict')['blocks'] if b['type'] == 0
            for l in b.get('lines', []) for s in l['spans'] if s['text'].strip()]


def numbers_on(page, cfg):
    """그 쪽에 있는 문항 번호들. 쪼개진 글자는 이어 붙인다."""
    rows = collections.defaultdict(list)
    for s in spans(page):
        if cfg['font'] not in s['font']:
            continue
        if not (cfg['lo'] < s['size'] < cfg['hi']):
            continue
        if not s['text'].strip().isdigit():
            continue
        rows[round(s['bbox'][1])].append(s)
    out = []
    for _, ss in rows.items():
        ss.sort(key=lambda s: s['bbox'][0])
        cl = [[ss[0]]]
        for s in ss[1:]:
            if s['bbox'][0] - cl[-1][-1]['bbox'][2] > 6:
                cl.append([s])
            else:
                cl[-1].append(s)
        for c in cl:
            t = ''.join(x['text'].strip() for x in c)
            if re.fullmatch(cfg['pat'], t):
                out.append(t)
    return out


def measure_offset(doc):
    """쪽 아래 여백에 인쇄된 쪽번호를 읽어 (인쇄된 쪽 − PDF 쪽) 을 구한다."""
    votes = collections.Counter()
    for i in range(len(doc)):
        p = doc[i]
        H = p.rect.height
        for s in spans(p):
            t = s['text'].strip()
            if s['bbox'][3] > H - 45 and re.fullmatch(r'\d{1,3}', t):
                votes[int(t) - (i + 1)] += 1
    if not votes:
        return None, votes
    off, n = votes.most_common(1)[0]
    return off, votes


def run(name, write):
    cfg = BOOKS[name]
    if not os.path.exists(cfg['pdf']):
        print('%s: PDF 없음 — %s' % (cfg['book'], cfg['pdf']))
        return
    rows = [r for r in fetch_all('/rest/v1/problems', {
        'select': 'id,local_no,page_no', 'book': 'eq.' + cfg['book'],
        'grade': 'eq.공통수학1', 'semester': 'eq.1'})]
    want = {str(r['local_no']): r for r in rows}
    doc = pymupdf.open(cfg['pdf'])
    off, votes = measure_offset(doc)
    if off is None:
        print('%s: 쪽번호를 못 읽어 건너뜀' % cfg['book'])
        return
    top = votes.most_common(3)
    print('%s — 문항 %d · PDF %d쪽 · offset %+d (표 %s)'
          % (cfg['book'], len(rows), len(doc), off, ' '.join('%+d:%d' % (k, v) for k, v in top)), flush=True)

    found = {}
    dup = 0
    for i in range(len(doc)):
        for t in numbers_on(doc[i], cfg):
            k = cfg['key'](t)
            if k in found:
                dup += 1
                continue
            found[k] = i + 1 + off
    hit = {k: v for k, v in found.items() if k in want}
    print('  읽은 번호 %d · DB와 맞은 것 %d / %d (%d%%) · 두 번 나온 번호 %d'
          % (len(found), len(hit), len(rows), 100 * len(hit) // max(len(rows), 1), dup))
    seq = [hit[k] for k in sorted(hit)]
    back = sum(1 for j in range(1, len(seq)) if seq[j] < seq[j - 1])
    print('  쪽이 거꾸로인 곳 %d  ← 0이어야 한다' % back)
    lo = min(seq) if seq else 0
    hi2 = max(seq) if seq else 0
    print('  쪽 범위 %d~%d (최대 가능 %d)' % (lo, hi2, len(doc) + off))
    if not write:
        print('  (--write 를 붙여야 저장합니다)')
        return
    if back or hi2 > len(doc) + off:
        print('  ✗ 이상해서 저장하지 않습니다')
        return
    n = 0
    for k, pg in hit.items():
        api('/rest/v1/problems', {'id': 'eq.' + str(want[k]['id'])}, method='PATCH',
            data=json.dumps({'page_no': pg}).encode())
        n += 1
        if n % 200 == 0:
            print('    저장 %d/%d' % (n, len(hit)), flush=True)
    print('  저장 %d개' % n)


# ── 개념+유형 개념편 — 예제와 유제가 섞여 있어 따로 다룬다 ──────────────
#   DB 번호: 0101(예제) · 0101S1~S3(유제).  PDF 에서도 예제 130 · 유제 315 로
#   개수가 정확히 같아서, **나오는 순서와 종류(예제/유제)가 같은지 대조한 뒤**
#   순서대로 짝짓는다.
KYGN = dict(
    book='개념+유형 개념편',
    pdf=os.path.join(B, '개념서', '개뿔_공통수학1_개념편_학생용.pdf'))


def kygn_seq(doc):
    seq = []
    for i, p in enumerate(doc):
        sp = spans(p)
        got = []
        for s in sp:
            t = s['text'].strip()
            fo = s['font']
            if fo.startswith('YDVYheadL') and s['size'] > 20 and re.fullmatch(r'\d{2}', t):
                got.append((s['bbox'][1], 'ex', i + 1))
            elif fo.startswith('YDVYheadL') and 8.5 < s['size'] < 9.5                     and re.fullmatch(r'\d{2}', t.replace(' ', '')):
                sub = [z for z in sp if z['font'].startswith('YDVYheadB')
                       and abs(z['bbox'][1] - s['bbox'][1]) < 8
                       and 0 < z['bbox'][0] - s['bbox'][2] < 20]
                if sub:
                    got.append((s['bbox'][1], 'pr', i + 1))
        got.sort()
        seq += [(k, pg) for _, k, pg in got]
    return seq


def run_kygn(write):
    rows = fetch_all('/rest/v1/problems', {
        'select': 'id,local_no,page_no', 'book': 'eq.' + KYGN['book'],
        'grade': 'eq.공통수학1', 'semester': 'eq.1'})
    order = sorted(str(r['local_no']) for r in rows)
    byln = {str(r['local_no']): r for r in rows}
    doc = pymupdf.open(KYGN['pdf'])
    off, _ = measure_offset(doc)
    off = off or 0
    seq = kygn_seq(doc)
    print('%s — 문항 %d · PDF %d쪽 · offset %+d' % (KYGN['book'], len(rows), len(doc), off))
    print('  PDF 에서 읽은 것 %d (예제 %d · 유제 %d)'
          % (len(seq), sum(1 for k, _ in seq if k == 'ex'), sum(1 for k, _ in seq if k == 'pr')))
    if len(seq) != len(order):
        print('  ✗ 개수가 달라 멈춥니다')
        return
    # 나오는 순서의 **종류**까지 같아야 한다
    mine = ['pr' if 'S' in x else 'ex' for x in order]
    theirs = [k for k, _ in seq]
    bad = sum(1 for a, b in zip(mine, theirs) if a != b)
    print('  예제/유제 순서가 다른 자리 %d  ← 0이어야 한다' % bad)
    if bad:
        return
    paired = {order[i]: seq[i][1] + off for i in range(len(order))}
    pgs = [paired[k] for k in order]
    back = sum(1 for i in range(1, len(pgs)) if pgs[i] < pgs[i - 1])
    print('  쪽이 거꾸로인 곳 %d · 쪽 범위 %d~%d (최대 %d)'
          % (back, min(pgs), max(pgs), len(doc) + off))
    if not write:
        print('  (--write 를 붙여야 저장합니다)')
        return
    if back:
        print('  ✗ 저장하지 않습니다')
        return
    n = 0
    for k, pg in paired.items():
        api('/rest/v1/problems', {'id': 'eq.' + str(byln[k]['id'])}, method='PATCH',
            data=json.dumps({'page_no': pg}).encode())
        n += 1
    print('  저장 %d개' % n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('which', help='rpm · mr · psj · all')
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    utf8_console()
    load_env()
    names = ALL + ALL_RESET if a.which == 'all' else [a.which]
    for name in names:
        if name in BOOKS:
            run(name, a.write)
        elif name in BOOKS_RESET:
            run_reset(name, a.write)
        elif name == 'kygn':
            run_kygn(a.write)
        else:
            print('모르는 교재:', name)
        print()


if __name__ == '__main__':
    main()
