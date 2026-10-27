# -*- coding: utf-8 -*-
"""빠른정답 표를 읽어 적은 조각들을 하나로 모으고, OCR 판독과 맞댄다.

  python scripts/answers/merge_reads.py <표판독폴더> <정답그림폴더>

표판독폴더에는 read_*.json 이 있고, 정답그림폴더에는 ocr.json 이 있다.
둘 다 열쇠는 교재 번호(local_no)다.

맞대는 규칙
  · **순수한 정수**만 본다. 분수·좌표·식은 OCR 이 반만 읽어 비교가 무의미하다.
  · 둘이 같으면 「두 겹 일치」, 다르면 눈으로 다시 볼 목록에 담는다.
"""
import io
import json
import os
import re
import sys

reads_dir, ans_dir = sys.argv[1], sys.argv[2]

table = {}
for fn in sorted(os.listdir(reads_dir)):
    if not fn.startswith('read_') or not fn.endswith('.json'):
        continue
    d = json.load(io.open(os.path.join(reads_dir, fn), encoding='utf8'))
    for no, v in d.get('답', {}).items():
        if no in table and table[no] != v:
            print(f'  ! 조각끼리 다름 {no}: {table[no]} / {v}')
        table[no] = v

ocr = json.load(io.open(os.path.join(ans_dir, 'ocr.json'), encoding='utf8'))
NUM = re.compile(r'^-?\d+$')

both, agree, differ = 0, 0, []
for no, t in table.items():
    o = ocr.get(no)
    if o is None:
        continue
    if not NUM.match(t):          # 표가 정수가 아니면 비교하지 않는다
        continue
    both += 1
    if NUM.match(o) and o == t:
        agree += 1
    else:
        differ.append((no, t, o))

json.dump(table, io.open(os.path.join(reads_dir, '표판독.json'), 'w', encoding='utf8'),
          ensure_ascii=False, indent=0)
print(f'표에서 읽은 문항 {len(table)} · 정답그림이 있는 것과 겹치는 정수 {both}')
print(f'  두 겹 일치 {agree} · 다시 볼 것 {len(differ)}')
for no, t, o in differ[:40]:
    print(f'    {no}  표:{t!r}  OCR:{o!r}')
