"""자르기가 만든 자료에 **학원 유형코드**를 채워 업로드용으로 완성한다.

crop.py 는 문항 번호·쪽·그림 경로까지 적어 둔다. 여기서는
  · map_<과정>.csv 의 (책소단원, 책유형) → 학원유형코드 를 붙이고
  · 정답 그림이 실제로 있는지 확인한 뒤
upload-problems.mjs 가 읽는 모양으로 저장한다.

문항 번호는 `소단원2 + 유형순번2 + 번호2` (예: 010203),
기출·마무리는 `소단원2 + E + 일련3` (예: 01E001) 이다.
유형순번은 **책에 인쇄된 유형 번호가 아니라 소단원 안에서 나온 순서**다
(쪼갠 유형 때문에 번호가 겹쳐 그림이 덮어써진 적이 있다 — scan.group 참고).

쓰는 법
  python scripts/crop-ky-mid/fill.py m31 --out "C:/Users/USER/문제은행/_ky중등"
"""
import argparse
import csv
import json
import os

ap = argparse.ArgumentParser()
ap.add_argument('tag')
ap.add_argument('--out', required=True)
a = ap.parse_args()

rows = json.load(open('scripts/problems_kymid_%s.json' % a.tag, encoding='utf8'))
m = {}
for r in csv.DictReader(open('scripts/crop-ky-mid/map_%s.csv' % a.tag, encoding='utf-8-sig')):
    m[(int(r['책소단원']), int(r['책유형']))] = r['학원유형코드']

noimg = noans = typed = 0
out = []
for r in rows:
    d = os.path.join(a.out, r['dir'].replace('/', os.sep))
    if not os.path.exists(os.path.join(d, r['l'] + '.png')):
        noimg += 1
        continue
    if 'E' in r['l']:
        code = None
    else:
        code = m.get((r['n'], int(r['l'][2:4])))
    if code:
        typed += 1
    if not os.path.exists(os.path.join(d, r['l'] + ').png')):
        noans += 1
    out.append({k: v for k, v in r.items() if k not in ('typeNo', 'typeTitle')} | {'c': code})

json.dump(out, open('scripts/problems_kymid_%s.json' % a.tag, 'w', encoding='utf8'), ensure_ascii=False)
print('문항 %d개 · 유형코드 붙은 것 %d · 정답 그림 없는 것 %d · 문제 그림 없는 것 %d'
      % (len(out), typed, noans, noimg))
