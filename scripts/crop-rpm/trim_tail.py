# -*- coding: utf-8 -*-
"""RPM 그림에서 **아래에 딸려 들어온 부분만** 잘라낸다.

  python scripts/crop-rpm/trim_tail.py <지금그림폴더> <다시자른그림폴더> <나갈폴더> <학기>

왜 이렇게 하나
  자르기 코드를 고쳐 다시 자르면 올바른 높이가 나오지만, 그 그림에는 **교재 원본
  번호가 되살아난다**(지금 올라가 있는 것은 rpm_fix.py 로 번호를 지운 것이다).
  그대로 덮어쓰면 학습지에 교재 번호가 돌아와 학생이 헷갈린다.
  그래서 다시 자른 그림은 **「어디까지가 맞는지 재는 자」로만** 쓰고,
  지금 그림의 아래쪽만 그 높이에 맞춰 잘라낸다. 번호도 가로 범위도 건드리지 않는다.

  두 그림은 같은 가로 범위에서 잘렸고 첫 줄도 같으므로, 높이 차이가 곧 딸려온 양이다.
  12px 이상 차이 나는 것만 손댄다(글자 한 줄이 안 되는 차이는 트림 여유다).
"""
import io
import json
import os
import sys
import numpy as np
from PIL import Image

live, new, out, sem = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
os.makedirs(out, exist_ok=True)

rows = json.load(io.open(os.path.join(live, 'list.json'), encoding='utf8'))
# list.json 에는 학기 칸이 없다. 중1 RPM 은 id 로 깔끔히 갈린다 — 겹침 0 을 확인했다.
#   중1-2 : 60612~61727 (1,116문항) · 중1-1 : 그 밖 (1,123문항)
def semester_of(i):
    return 2 if 60612 <= int(i) <= 61727 else 1
info = {str(r['id']): r for r in rows if semester_of(r['id']) == int(sem)}

newpath = {}
for d, _, fs in os.walk(new):
    for f in fs:
        if f.endswith('.png') and not f.endswith(').png'):
            newpath.setdefault(f[:-4], os.path.join(d, f))

cut, same, miss = [], 0, []
for pid, r in info.items():
    f = os.path.join(live, pid + '.png')
    if not os.path.exists(f):
        continue
    np_ = newpath.get(r['local_no'])
    if not np_:
        miss.append(r['local_no']); continue
    a = Image.open(f).convert('RGB')
    b = Image.open(np_).convert('RGB')
    if a.width != b.width:          # 가로가 다르면 같은 자리가 아니다 — 손대지 않는다
        miss.append(r['local_no']); continue
    d = a.height - b.height
    if d < 12:
        same += 1; continue
    a.crop((0, 0, a.width, b.height)).save(os.path.join(out, pid + '.png'))
    cut.append((pid, r['local_no'], a.height, b.height, d))

json.dump([dict(id=int(p), no=n, before=h0, after=h1, cut=d) for p, n, h0, h1, d in cut],
          io.open(os.path.join(out, '_cut.json'), 'w', encoding='utf8'), ensure_ascii=False)
print(f'잘라낼 문항 {len(cut)} · 그대로 {same} · 짝 못 찾음 {len(miss)}')
for p, n, h0, h1, d in sorted(cut, key=lambda t: -t[4])[:12]:
    print(f'  {n}  {h0} → {h1}  ({d}px 잘라냄)')
