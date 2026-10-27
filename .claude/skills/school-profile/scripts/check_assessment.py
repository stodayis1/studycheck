"""자료집에 옮긴 수행평가(stats.assessment)가 평가계획 원문 쪽과 맞는지 대조한다.

  python check_assessment.py <자료집.json 또는 assessment.json> <PDF 폴더>

plan.page 는 「<파일 이름> <N>쪽 …」 꼴이다(N = PDF 파일 안의 쪽 순서, 1부터). 그 쪽 글자에서
  - 영역 이름·방식·만점(N점)·반영 비율(N%)·시기가 글자 그대로 있는지 (띄어쓰기는 무시)
  - 정기시험 + 수행평가 = 100, 수행 영역 비율 합 = 수행평가 비율, 정기시험 칸 비율 합 = 정기시험 비율
을 본다. 마지막 줄이 「통과 N / 전체 N」(같음)이어야 한다. pymupdf 가 필요하다.
"""
import argparse
import json
import os
import re
import sys


def squash(s):
    return re.sub(r'\s+', '', s or '')


def num(x):
    return str(int(x)) if float(x).is_integer() else str(x)


def page_text(folder, page):
    import pymupdf
    pymupdf.TOOLS.mupdf_display_errors(False)
    m = re.match(r'(.+?\.pdf)\s+(\d+)쪽', page or '')
    if not m:
        return None, f'page 꼴이 「<파일>.pdf <N>쪽」이 아님: {page!r}'
    path = os.path.join(folder, m.group(1))
    if not os.path.exists(path):
        return None, f'원문 파일이 없음: {m.group(1)}'
    doc = pymupdf.open(path)
    n = int(m.group(2))
    if not 1 <= n <= len(doc):
        return None, f'{m.group(1)} 에 {n}쪽이 없음(전체 {len(doc)}쪽)'
    return squash(doc[n - 1].get_text()), None


def check(data, folder):
    a = data.get('stats', {}).get('assessment') if 'stats' in data else data
    res = []

    def ok(cond, msg):
        res.append((bool(cond), msg))

    ok(a and a.get('plans'), 'assessment.plans 가 있다')
    if not (a and a.get('plans')):
        return res
    for p in a['plans']:
        who = f"{p.get('grade')} {p.get('term')} {p.get('subject')}"
        text, err = page_text(folder, p.get('page'))
        ok(not err, f'{who}: 원문 쪽 열기' + (f' — {err}' if err else ''))
        if err:
            continue
        has = lambda s: squash(s) in text
        tasks, exams = p.get('tasks') or [], p.get('exams') or []
        if p.get('examRatio') is not None and p.get('perfRatio') is not None:
            ok(p['examRatio'] + p['perfRatio'] == 100, f"{who}: 정기시험 {p['examRatio']} + 수행 {p['perfRatio']} = 100")
        for key, label in (('examRatio', '정기시험'), ('perfRatio', '수행평가'), ('essayRatio', '논술형 합')):
            if p.get(key) is not None:
                ok(has(num(p[key]) + '%'), f'{who}: {label} {num(p[key])}% 가 원문에 있다')
        if p.get('perfRatio') is not None and tasks and all(t.get('ratio') is not None for t in tasks):
            s = sum(t['ratio'] for t in tasks)
            ok(abs(s - p['perfRatio']) < 1e-9, f"{who}: 수행 영역 비율 합 {num(s)} = {num(p['perfRatio'])}")
        if p.get('examRatio') is not None and exams and all(e.get('ratio') is not None for e in exams):
            s = sum(e['ratio'] for e in exams)
            ok(abs(s - p['examRatio']) < 1e-9, f"{who}: 정기시험 칸 비율 합 {num(s)} = {num(p['examRatio'])}")
        for t in tasks + exams:
            words = t['label'].split() if t in exams else [t['label']]   # 정기시험 칸은 「2차 선택형」처럼 낱말로 본다
            for w in words:
                ok(has(w), f"{who}: 「{w}」 가 원문에 있다")
            if t.get('kind'):
                ok(has(t['kind']), f"{who}: {t['label']} 방식 「{t['kind']}」")
            if t.get('points') is not None:
                ok(has(num(t['points']) + '점'), f"{who}: {t['label']} {num(t['points'])}점")
            if t.get('ratio') is not None:
                ok(has(num(t['ratio']) + '%'), f"{who}: {t['label']} {num(t['ratio'])}%")
            if t.get('when'):
                ok(has(t['when']), f"{who}: {t['label']} 시기 「{t['when']}」")
    return res


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('json')
    ap.add_argument('folder')
    a = ap.parse_args()
    data = json.load(open(a.json, encoding='utf-8'))
    res = check(data, a.folder)
    for good, msg in res:
        if not good:
            print('✗', msg)
    n = sum(1 for g, _ in res if g)
    print(f'통과 {n} / 전체 {len(res)}')
    print('판정: ' + ('통과' if n == len(res) else '다시 보기'))
    sys.exit(0 if n == len(res) else 1)


if __name__ == '__main__':
    main()
