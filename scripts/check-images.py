"""문제은행 전체에서 **그림 파일이 없는 문항**을 찾는다.

왜 필요한가
  DB 에 문항은 들어 있고 image_path 도 적혀 있는데 저장소에 그 파일이 없으면,
  문제은행 표에서는 멀쩡해 보이지만 학습지·인쇄 화면에서는 **빈칸**으로 나온다.
  2026-09-15 베이직쎈을 올릴 때 b·d 시리즈 898장이 이렇게 빠졌고, 10-03 에야 찾았다.
  (원인은 upload-problems.mjs 의 파일 이름 걸러내기가 a·c 만 받던 것 — 지금은 고쳤다)

  교재를 새로 올린 뒤에는 **반드시 한 번 돌려** 0 인지 확인한다.

쓰는 법 (PowerShell)
  python scripts/check-images.py

  몇 분 걸린다(저장소 폴더를 전부 훑는다). 끝에 '합계 그림없음 0' 이어야 정상이다.
"""
import os, sys, json as J, urllib.request, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'page-map'))
from match import load_env, fetch_all
load_env()
key = os.environ['SUPABASE_SERVICE_ROLE_KEY']


def ls(pre):
    url = os.environ['NEXT_PUBLIC_SUPABASE_URL'] + '/storage/v1/object/list/problem-images'
    out, off = set(), 0
    while True:
        req = urllib.request.Request(url, method='POST', data=J.dumps(
            {'prefix': pre, 'limit': 1000, 'offset': off}).encode())
        for k, v in {'apikey': key, 'Authorization': 'Bearer ' + key,
                     'Content-Type': 'application/json'}.items():
            req.add_header(k, v)
        with urllib.request.urlopen(req, timeout=120) as r:
            got = J.loads(r.read())
        out |= set(g['name'] for g in got)
        if len(got) < 1000:
            return out
        off += 1000


rows = fetch_all('/rest/v1/problems', {'select': 'id,book,grade,semester,local_no,image_path'})
print('문항', len(rows), flush=True)
dirs = sorted(set((r['image_path'] or '').rsplit('/', 1)[0] for r in rows if r.get('image_path')))
print('폴더', len(dirs), flush=True)
have = {}
for i, d in enumerate(dirs):
    have[d] = ls(d)
    if i % 50 == 0:
        print('  %d/%d' % (i, len(dirs)), flush=True)

miss = collections.Counter()
tot = collections.Counter()
samples = collections.defaultdict(list)
for r in rows:
    p = r.get('image_path')
    kb = (r['book'], r['grade'], str(r['semester']))
    tot[kb] += 1
    if not p:
        miss[kb] += 1
        continue
    d, n = p.rsplit('/', 1)
    if n not in have.get(d, ()):
        miss[kb] += 1
        if len(samples[kb]) < 3:
            samples[kb].append(p)
print()
print('%-22s %-8s %6s %6s' % ('교재', '과정', '전체', '그림없음'))
for kb in sorted(tot):
    if miss[kb]:
        print('%-22s %-8s %6d %6d   %s' % (kb[0], kb[1] + '-' + kb[2], tot[kb], miss[kb],
                                           ' '.join(samples[kb])))
print('\n합계 그림없음 %d / %d' % (sum(miss.values()), len(rows)))
if sum(miss.values()):
    print('→ 빠진 그림을 다시 올려야 합니다. 원본은 C:/Users/USER/문제은행 아래에 있습니다.')
    sys.exit(1)
