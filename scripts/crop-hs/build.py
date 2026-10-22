"""잘라 둔 「핵심정리 및 유형별 교재」를 업로드용 데이터 파일과 폴더로 만든다.

  python scripts/crop-hs/build.py <자른폴더> <쌓을폴더>

난이도 — 원장님 말씀대로 「쌍둥이·유사문항에서 레벨별로」 쓰려고 나눈다
  예제            → 하
  유형별 보통 묶음   → 중
  ○○ 심화 문제     → 상
  ○○ 서술형 문제   → 상 (is_essay 도 켠다)
"""
import io
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TITLE = {1: '기본 도형', 2: '위치 관계', 3: '평행선', 4: '작도와 합동', 5: '다각형',
         6: '원과 부채꼴', 7: '다면체', 8: '회전체', 9: '입체도형의 겉넓이와 부피',
         10: '도수분포표', 11: '상대도수', 12: '대푯값'}
CIRCLE = '①②③④⑤'


def main():
    src, stage = sys.argv[1], sys.argv[2]
    tmap = json.load(io.open(os.path.join(HERE, 'typemap.json'), encoding='utf8'))
    kmap = json.load(io.open(os.path.join(HERE, 'keywords.json'), encoding='utf8'))['규칙']

    rows, sol_index, miss = [], {}, []
    hit_n, try_n, essay_n = 0, 0, 0
    soldir = os.path.join(stage, '_해설')
    os.makedirs(soldir, exist_ok=True)

    for name in sorted(os.listdir(src)):
        folder = os.path.join(src, name)
        if not os.path.isdir(folder) or not os.path.exists(os.path.join(folder, 'items.json')):
            continue
        items = json.load(io.open(os.path.join(folder, 'items.json'), encoding='utf8'))
        ans = json.load(io.open(os.path.join(folder, 'answers.json'), encoding='utf8'))['answers']
        txt = json.load(io.open(os.path.join(folder, 'texts.json'), encoding='utf8'))
        for p in items:
            no = p['no']
            title = p['typeTitle'] or ''
            code = tmap.get(title)
            if not code:
                miss.append(name + '/' + str(no) + '/' + title)
                continue
            rules = kmap.get(title)
            essay = '서술형' in title
            hard = '심화' in title or essay
            if rules:
                try_n += 1
                blob = txt['q'].get(str(no), '') + ' ' + txt['s'].get(str(no), '')
                hit = next((c for k, c in rules if k in blob), None)
                if hit:
                    code = hit
                    hit_n += 1
            if essay:
                essay_n += 1
            n = int(code.split('-')[2])
            a = (ans.get(str(no)) or '').strip()
            if any(c in a for c in CIRCLE):
                kind, text = 'choice', ''.join(c for c in a if c in CIRCLE)
            elif re.fullmatch(r'-?\d+(\.\d+)?', a):
                kind, text = 'number', a
            else:
                kind, text = 'image', None
            rows.append(dict(b='핵심유형', g='중1', s=2, n=n, t=TITLE[n], l=str(no), c=code,
                             d='상' if hard else ('하' if p['kind'] == '예제' else '중'),
                             p=None, e=essay, v=False, i=False, k=kind, a=text,
                             x='png', pg=p['page'] + 1, dir='중1-2/핵심유형/' + ('%02d' % n)))
            out = os.path.join(stage, '중1-2', '핵심유형', '%02d' % n)
            os.makedirs(out, exist_ok=True)
            shutil.copyfile(os.path.join(folder, 'q', '%04d.png' % no),
                            os.path.join(out, str(no) + '.png'))
            shutil.copyfile(os.path.join(folder, 'a', '%04d.png' % no),
                            os.path.join(out, str(no) + ').png'))
            s = os.path.join(folder, 's', '%04d.png' % no)
            if os.path.exists(s):
                tag = '%02d_%d' % (n, no)
                shutil.copyfile(s, os.path.join(soldir, tag + '.png'))
                sol_index['%02d|%d' % (n, no)] = dict(file=tag + '.png')

    json.dump(sol_index, io.open(os.path.join(soldir, 'index.json'), 'w', encoding='utf8'),
              ensure_ascii=False)
    json.dump(rows, io.open(os.path.join(os.path.dirname(HERE), 'problems_core_m1_2.json'),
                            'w', encoding='utf8'), ensure_ascii=False)

    keys = [(r['n'], r['l']) for r in rows]
    cnt, kcnt, dcnt = {}, {}, {}
    for r in rows:
        cnt[r['n']] = cnt.get(r['n'], 0) + 1
        kcnt[r['k']] = kcnt.get(r['k'], 0) + 1
        dcnt[r['d']] = dcnt.get(r['d'], 0) + 1
    report = ['문항 %d개 · 해설 %d개' % (len(rows), len(sol_index)),
              '번호 겹침 %d개' % (len(keys) - len(set(keys))),
              '유형코드 못 붙인 문항 %d개 %s' % (len(miss), miss[:6]),
              '심화·서술형 %d개 중 글을 보고 더 가른 것 %d개' % (try_n, hit_n),
              '정답 방식 %s' % kcnt, '난이도 %s' % dcnt, '서술형 %d개' % essay_n,
              '소단원별: %s' % dict(sorted(cnt.items()))]
    io.open(os.path.join(stage, '_점검.txt'), 'w', encoding='utf8').write('\n'.join(report))


if __name__ == '__main__':
    main()
