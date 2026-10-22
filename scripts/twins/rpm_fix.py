"""내려받은 RPM 그림에서 교재 번호를 지워 <작업폴더>/fixed 에 쓴다.

  python scripts/twins/rpm_fix.py <작업폴더>
아는 번호와 읽은 값이 맞는 것만 고친다. 못 고친 것은 report.json 에 적어 둔다.
"""
import io
import json
import os
import sys
import pickle
import numpy as np
from PIL import Image
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rpm_strip import fix_one, train

work = sys.argv[1]
orig = os.path.join(work, 'orig')
fixed = os.path.join(work, 'fixed')
os.makedirs(fixed, exist_ok=True)
meta = json.load(io.open(os.path.join(work, 'meta.json'), encoding='utf8'))
items = [(r, os.path.join(orig, f"{r['id']}.png")) for r in meta
         if os.path.exists(os.path.join(orig, f"{r['id']}.png"))]
print(f'그림 {len(items)}장')

mp = os.path.join(work, 'digits.pkl')
if os.path.exists(mp):
    M = pickle.load(open(mp, 'rb'))
else:
    print('  글자 틀 만드는 중 (그림에서 스스로 배운다)…')
    M = train(items[::3])          # 셋에 하나만 써도 충분하다
    pickle.dump(M, open(mp, 'wb'))
print('  글자 틀', ''.join(sorted(M)))

cnt = Counter()
bad = []
for k, (r, f) in enumerate(items):
    a = np.array(Image.open(f).convert('RGB'))
    # 반만 지워지는 번호가 있다(0111 → 11 이 남음). 더 지울 게 없을 때까지 되풀이한다.
    b, how = fix_one(M, a, r['local_no'])
    if b is not None:
        for _ in range(3):
            b2, _h = fix_one(M, b, r['local_no'])
            if b2 is None:
                break
            b = b2
    cnt[how] += 1
    if b is None:
        bad.append(dict(id=r['id'], grade=r['grade'], semester=r['semester'], local_no=r['local_no']))
    else:
        Image.fromarray(b).save(os.path.join(fixed, f"{r['id']}.png"))
    if (k + 1) % 500 == 0:
        print(f'    {k + 1}/{len(items)}')
json.dump(bad, io.open(os.path.join(work, 'report.json'), 'w', encoding='utf8'), ensure_ascii=False)
ok = len(items) - cnt['안맞음']
print(f'고침 {ok}/{len(items)} ({ok / len(items):.1%}) · 손 안 댐 {cnt["안맞음"]}')
print('  방법별:', dict(cnt))
