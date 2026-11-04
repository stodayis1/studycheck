# -*- coding: utf-8 -*-
"""판독한 값으로 **한 권의 글자 정답을 통째로 다시 쓰는** SQL 을 짠다.

  python scripts/answers/make_sql_from_read.py <판독.txt> <_db.json> <교재이름> <나갈폴더>

make_sql.py 와 다른 점 — make_sql.py 는 「비어 있던 자리를 채우고, 있는 값은 검산」한다.
여기는 **들어 있는 값을 믿을 수 없을 때** 쓴다. 개념+유형 유형편 공수1 이 그랬다(2026-11-04):
문제·정답 그림은 제자리인데 글자 정답만 남의 자리 값이었다.

세 갈래로 가른다 (scripts/answers/README.md 의 규칙 그대로):
  · 객관식(①~⑤, 복수정답 '①, ③')  → answer_kind='choice'
  · 숫자(+단위)                      → answer_kind='number' + answer_unit
  · 그 밖(식·부등식·집합·행렬·문장)  → answer_text=null, answer_kind='image'
    ★ 이것을 글자로 넣으면 **학생이 칠 수 없는 답**이 되고, 서버가 정답 그림도 안 보여 준다.
      맞춰 볼 것이 아무것도 없어진다.
"""
import io
import json
import os
import re
import sys

read_p, db_p, book, out = sys.argv[1:5]
db = json.load(io.open(db_p, encoding='utf8'))
os.makedirs(out, exist_ok=True)

NUM = re.compile(r'^[+-]?\d+(?:\.\d+)?$')
CIRCLE = '①②③④⑤'
UNITS = ['cm³', 'cm²', 'cm', 'mm', 'km', 'kg', 'mL', 'm', 'g', 'L', '개월', '개', '원', '명', '쪽', '권',
         '장', '자루', '마리', '송이', '바퀴', '그루', '점', '살', '주', '일', '시간', '분', '초', '년',
         '대', '℃', '℉', '%', '°', '가지', '번째']
UNITED = re.compile(r'^([+-]?\d+(?:\.\d+)?)\s*(.+)$')


def split_unit(v):
    m = UNITED.match(v)
    if not m:
        return None
    tail = m.group(2).strip()
    return (m.group(1), tail) if tail in UNITS else None


def is_choice(v):
    return bool(v) and any(c in CIRCLE for c in v) and all(c in CIRCLE or c in ', ' for c in v)


def clean(s):
    return (s or '').replace('−', '-').replace('–', '-').replace('—', '-').strip()


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


rows = []            # (id, no, 새kind, 새text, 새unit, 옛kind, 옛text, 옛unit)
for line in io.open(read_p, encoding='utf8').read().split('\n'):
    if not line.strip():
        continue
    no, _, raw = line.partition(' ')
    rec = db.get(no)
    if not rec:
        print('DB 에 없는 번호:', no)
        continue
    v = clean(raw)
    if is_choice(v):
        new = ('choice', v, None)
    elif NUM.match(v):
        new = ('number', v, None)
    elif split_unit(v):
        n, u = split_unit(v)
        new = ('number', n, u)
    else:
        new = ('image', None, None)          # 식·문장·행렬 → 그림으로 돌린다
    old = (rec['kind'], clean(rec['text']) or None, rec['unit'])
    if new != old:
        rows.append((rec['id'], no) + new + old)

kinds = {}
for r in rows:
    kinds[r[2]] = kinds.get(r[2], 0) + 1


def write(name, head, body):
    io.open(os.path.join(out, name), 'w', encoding='utf8').write(head + body)


def stmt(sel):
    b = 'update problems p set answer_kind = v.kind, answer_text = v.txt, answer_unit = v.unit\nfrom (values\n'
    # ★ null 을 그냥 쓰면 VALUES 의 그 칸이 unknown 이 돼 「타입을 알 수 없다」로 멈춘다
    b += ',\n'.join(f"  ({i}::bigint, {q(k)}, {q(t) if t is not None else 'null'}::text, "
                    f"{q(u) if u else 'null'}::text)" for i, k, t, u in sel)
    b += '\n) as v(id, kind, txt, unit)\nwhere p.id = v.id;\n'
    return b


write('글자정답_다시쓰기.sql',
      f'-- {book} — 글자 정답 {len(rows)}문항을 정답 그림에서 다시 읽은 값으로 바꾼다\n'
      f'--   객관식 {kinds.get("choice",0)} · 숫자 {kinds.get("number",0)} · 그림으로 되돌릴 것 {kinds.get("image",0)}\n'
      f'-- 왜 — 들어 있던 글자 정답이 **남의 자리 값**이었다. 문제·정답 그림은 제자리다.\n'
      f'-- 판독은 두 번 했다(작게 많이 / 크게 적게). 식·부등식·행렬은 글자로 넣지 않는다.\n',
      stmt([(r[0], r[2], r[3], r[4]) for r in rows]))
write('글자정답_되돌리기.sql',
      f'-- 위 다시쓰기의 되돌리기 ({len(rows)}문항)\n',
      stmt([(r[0], r[5], r[6], r[7]) for r in rows]))

json.dump([dict(id=r[0], no=r[1], before=f'{r[5]}:{r[6]}', after=f'{r[2]}:{r[3]}' + (f' {r[4]}' if r[4] else ''))
           for r in rows],
          io.open(os.path.join(out, '_바꿀목록.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(f'바꿀 것 {len(rows)} - 객관식 {kinds.get("choice",0)} · 숫자 {kinds.get("number",0)} · 그림으로 {kinds.get("image",0)}')
