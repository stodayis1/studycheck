"""책의 유형 이름을 읽어 **학원 표준유형표**에 연결할 표를 만든다.

왜 그냥 못 붙이나
  이 책은 「유형편 라이트」라 유형을 굵게 묶는다. 중3-1 이 책은 63개인데
  학원 유형표(쎈 기준)는 171개다. 책 유형 하나가 학원 유형 두세 개에 걸친다.
  그래서 **사람이 한 번 보고 고칠 수 있는 표**를 만들어 두고 쓴다.

어떻게 고르나
  1) 이름을 수식 기호까지 풀어서 맞춘다 (a@ → a², j5k → √5)
  2) 소단원 안에서 먼저 찾고, 없으면 그 과정 전체에서 찾는다
  3) 글자가 얼마나 겹치는지로 점수를 매겨 가장 가까운 것을 고른다
  4) 점수를 같이 적어 둔다 — 낮은 것부터 사람이 보면 된다

쓰는 법
  python scripts/crop-ky-mid/types.py 중3 1 --csv scripts/crop-ky-mid/map_m31.csv
  (csv 를 원장님이 고친 뒤 upload 단계에서 그대로 쓴다)
"""
import argparse
import csv
import difflib
import os
import re
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(HERE)), 'scripts', 'page-map'))
from scan import B, PDFS, read, group   # noqa: E402
from match import load_env, fetch_all   # noqa: E402


def unmath(t):
    """한글 수식 편집기 표기를 사람이 읽는 글자로.

    이 교재들은 수식을 글자 코드로 담고 있다. 그대로 두면
    'a@의 성질', 'jl제곱인 수qw' 처럼 나와 유형 이름을 맞출 수 없다.
    """
    t = t or ''
    t = t.replace('`', ' ').replace(' ', ' ').replace('\xa0', ' ').replace(' ', '')
    t = t.replace('@', '²').replace('#', '³').replace('$', '⁴')
    t = re.sub(r'j\s*([0-9a-zA-Z]+)\s*k', r'√\1', t)   # j5k → √5
    t = t.replace('jl', '√(').replace('qw', ')')
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def key(t):
    """맞춰 보기용 — 띄어쓰기·괄호·번호 표시를 떼고 본다."""
    return re.sub(r'[\s/·,()⑴-⑽①-⑩\[\]]', '', unmath(t))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('grade')
    ap.add_argument('semester', type=int)
    ap.add_argument('--csv', required=True)
    a = ap.parse_args()
    load_env()

    body, _ = PDFS[(a.grade, a.semester)]
    doc = pymupdf.open(os.path.join(B, body))
    gs, _ = group(read(doc))

    st = fetch_all('/rest/v1/standard_types', {
        'select': 'code,sub_chapter_no,sub_chapter_title,type_no,type_title',
        'grade': 'eq.' + a.grade, 'semester': 'eq.%d' % a.semester, 'order': 'code'})
    for t in st:
        t['key'] = key(t['type_title'])

    # 책 소단원 → 학원 소단원: 책의 소단원 순서와 학원 소단원 번호를 순서대로 맞춰 본다
    subs = sorted({t['sub_chapter_no'] for t in st})
    bookSubs = sorted({g['sub'] for g in gs})
    guess = {b: subs[min(i, len(subs) - 1)] for i, b in enumerate(bookSubs)}

    rows = []
    for g in gs:
        name = unmath(g['title'])
        k = key(g['title'])
        pool = [t for t in st if t['sub_chapter_no'] == guess.get(g['sub'])] or st
        def score(t):
            return difflib.SequenceMatcher(None, k, t['key']).ratio()
        best = max(pool, key=score) if pool else None
        bestAll = max(st, key=score) if st else None
        # 소단원 안에서 찾은 게 너무 약하면 과정 전체에서 고른 것을 쓴다
        pick = best if best and score(best) >= 0.55 else bestAll
        rows.append({
            '책소단원': g['sub'], '책유형': g['typeNo'], '책유형이름': name,
            '문항수': len(g['items']),
            '학원유형코드': pick['code'] if pick else '',
            '학원유형이름': pick['type_title'] if pick else '',
            '학원소단원': pick['sub_chapter_title'] if pick else '',
            '점수': round(score(pick), 2) if pick else 0,
        })
    rows.sort(key=lambda r: (r['점수'], r['책소단원'], r['책유형']))
    with open(a.csv, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    lo = sum(1 for r in rows if r['점수'] < 0.6)
    print('%s-%d · 책 유형 %d개 → %s' % (a.grade, a.semester, len(rows), a.csv))
    print('  꼭 봐야 할 것(점수 0.6 미만) %d개 · 0.9 이상 %d개'
          % (lo, sum(1 for r in rows if r['점수'] >= 0.9)))
    for r in rows[:8]:
        print('   %.2f  소%d 유형%-2d %-28s → %s %s'
              % (r['점수'], r['책소단원'], r['책유형'], r['책유형이름'][:28],
                 r['학원유형코드'], r['학원유형이름'][:24]))


if __name__ == '__main__':
    main()
