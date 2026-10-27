# -*- coding: utf-8 -*-
"""빠른정답 표에서 읽은 값으로 (1) 기존 정답 검산 (2) 비어 있던 숫자 정답 채우기 를 만든다.

  python scripts/answers/make_sql.py <표판독.json> <DB현황.json> <교재> <과정> <학기> <나갈폴더>

DB현황.json 은 {local_no: {"id":.., "kind":.., "text":..}} 꼴이다(없으면 text=null).

규칙 (scripts/answers/README.md)
  · **순수한 정수만** 글자 정답으로 바꾼다. 단위가 붙은 답·식·집합·O/X 는 그림 그대로 둔다
    (채점은 공백·쉼표만 지우고 글자 그대로 비교한다 — 단위가 붙으면 학생이 숫자만 써도 틀린다)
  · 빼기표는 **키보드로 치는 '-'** 로 넣는다. 수학 빼기표(−, U+2212)를 넣으면
    학생이 '-' 를 쳐도 틀리게 채점된다
  · 객관식은 ①~⑤ 로 넣는다 (app/api/grade/[code] 의 choiceDigits 가 그것만 읽는다)
"""
import io
import json
import os
import re
import sys

table_p, db_p, book, grade, sem, out = sys.argv[1:7]
table = json.load(io.open(table_p, encoding='utf8'))
db = json.load(io.open(db_p, encoding='utf8'))
os.makedirs(out, exist_ok=True)

NUM = re.compile(r'^-?\d+$')
CIRCLE = '①②③④⑤'


def clean(s):
    return (s or '').replace('−', '-').replace('–', '-').replace('—', '-').strip()


fix, add, skip = [], [], []
for no, raw in table.items():
    v = clean(raw)
    rec = db.get(no)
    if not rec:
        continue
    cur = clean(rec.get('text'))
    if cur:                                   # 이미 글자 정답이 있다 → 검산
        if cur != v and (v in CIRCLE or NUM.match(v)):
            fix.append((rec['id'], no, cur, v))
    else:                                     # 비어 있다 → 숫자만 채운다
        if NUM.match(v):
            add.append((rec['id'], no, v))
        else:
            skip.append((no, v))

def dump(name, head, rows, body):
    with io.open(os.path.join(out, name), 'w', encoding='utf8') as f:
        f.write(head)
        f.write(body)

if fix:
    body = 'update problems p set answer_text = v.txt\nfrom (values\n'
    body += ',\n'.join(f"  ('{i}'::bigint, '{t}')" for i, _, _, t in fix)
    body += '\n) as v(id, txt)\nwhere p.id = v.id;\n'
    dump('검산_바로잡기.sql',
         f'-- {book} {grade} — 빠른정답 원본과 달랐던 {len(fix)}문항을 바로잡는다\n'
         f'-- 원본: 빠른정답 PDF 를 눈으로 읽고(번호와 답이 함께 있어 밀림을 잡는다),\n'
         f'--       다른 곳은 6배로 키워 확인했다.\n', fix, body)
    rb = 'update problems p set answer_text = v.txt\nfrom (values\n'
    rb += ',\n'.join(f"  ('{i}'::bigint, '{c}')" for i, _, c, _ in fix)
    rb += '\n) as v(id, txt)\nwhere p.id = v.id;\n'
    dump('검산_되돌리기.sql', f'-- 위 바로잡기의 되돌리기 ({len(fix)}문항)\n', fix, rb)

if add:
    body = "update problems p set answer_kind = 'number', answer_text = v.txt\nfrom (values\n"
    body += ',\n'.join(f"  ('{i}'::bigint, '{t}')" for i, _, t in add)
    body += '\n) as v(id, txt)\nwhere p.id = v.id;\n'
    dump('숫자정답_넣기.sql',
         f'-- {book} {grade} — 그림으로만 있던 정답 중 **순수한 정수** {len(add)}문항을 글자 정답으로\n'
         f'-- 단위가 붙은 답·식·집합·O/X 는 그림 그대로 둔다(학생 자기채점).\n'
         f'-- 빼기표는 키보드로 치는 - 를 쓴다.\n', add, body)
    rb = "update problems set answer_kind = 'image', answer_text = null\nwhere id in (\n"
    rb += ',\n'.join(f"  '{i}'::bigint" for i, _, _ in add)
    rb += '\n);\n'
    dump('숫자정답_되돌리기.sql', f'-- 위 넣기의 되돌리기 ({len(add)}문항)\n', add, rb)

json.dump([dict(id=i, no=n, before=c, after=t) for i, n, c, t in fix],
          io.open(os.path.join(out, '_검산목록.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
json.dump([dict(id=i, no=n, txt=t) for i, n, t in add],
          io.open(os.path.join(out, '_넣을목록.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)

print(f'검산해서 바로잡을 것 {len(fix)} · 새로 넣을 숫자 정답 {len(add)} · 그림 그대로 둘 것 {len(skip)}')
for i, n, c, t in fix[:40]:
    print(f'  바로잡기 {n}: {c} → {t}')
