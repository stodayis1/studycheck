"""라이트쎈 — 지시문이 빠진 문항에 이웃의 지시문을 붙여 <작업폴더>/fixed 에 쓴다.

  python scripts/twins/light_fix.py <작업폴더> [--dry]

지시문이 빠졌다고 보는 기준: 그림 높이가 낮고(<130px) 글 덩어리가 하나뿐이다.
**위아래 이웃이 같은 지시문을 쓸 때만** 붙인다 — 다른 묶음의 지시문을 잘못 붙이지 않으려고.
"""
import io
import json
import os
import sys
import numpy as np
from PIL import Image
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from light_inst import instruction_band, attach, common_top, ink_rows, same_instruction

work = sys.argv[1]
dry = '--dry' in sys.argv
img = os.path.join(work, 'img')
out = os.path.join(work, 'fixed')
os.makedirs(out, exist_ok=True)
meta = json.load(io.open(os.path.join(work, 'meta.json'), encoding='utf8'))
have = {r['id']: r for r in meta if os.path.exists(os.path.join(img, f"{r['id']}.png"))}


def load(i):
    return np.array(Image.open(os.path.join(img, f'{i}.png')).convert('RGB'))


# 「지시문이 빠졌다」는 판정은 **이웃과의 비교**로만 한다.
# 높이·덩어리 수·글 폭 같은 기준은 번번이 빗나갔다 (지시문이 이미 있는 문항까지
# 빠졌다고 봐서 두 번 붙였다). 아래 규칙 하나면 된다:
#   앞뒤 이웃이 **같은 지시문 띠**를 쓰는데 이 문항만 그 띠가 없다 → 빠진 것.

groups = defaultdict(list)
for r in have.values():
    groups[(r['grade'], r['semester'], r['type_code'])].append(r)
for v in groups.values():
    v.sort(key=lambda r: r['local_no'])

cnt = Counter()
done = []
for key, v in groups.items():
    for i in range(1, len(v) - 1):
        r, up, dn = v[i], v[i - 1], v[i + 1]
        A, B = load(up['id']), load(dn['id'])
        if not same_instruction(A, B):
            cnt['이웃이 같은 지시문을 안 씀'] += 1
            continue
        if same_instruction(load(r['id']), A):
            cnt['이미 지시문 있음'] += 1
            continue
        band = instruction_band([A, B]) if common_top(A, B) >= 20 else instruction_band([A])
        if band is None or band.shape[0] < 20:
            cnt['지시문 띠 못 뽑음'] += 1
            continue
        b = attach(band, load(r['id']))
        if not dry:
            Image.fromarray(b).save(os.path.join(out, f"{r['id']}.png"))
        cnt['붙임'] += 1
        done.append(dict(id=r['id'], grade=r['grade'], semester=r['semester'],
                         local_no=r['local_no'], 이웃=f"{up['local_no']}·{dn['local_no']}"))
json.dump(done, io.open(os.path.join(work, 'done.json'), 'w', encoding='utf8'), ensure_ascii=False)
print('지시문 빠진 것으로 본 문항:', sum(cnt.values()))
print(' ', dict(cnt))
