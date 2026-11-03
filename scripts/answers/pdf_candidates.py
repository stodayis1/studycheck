# -*- coding: utf-8 -*-
"""해설 PDF 에서 뽑은 답 중 **글자 정답으로 넣을 수 있는 것**만 골라 낸다.

  python scripts/answers/pdf_candidates.py <해설판독.json> <정답그림폴더> <나갈폴더>

고르는 것: 객관식(①~⑤) · 숫자 · 숫자+단위. 그 밖(식·분수·여러 값)은 그림 그대로 둔다.
DB 에 이미 글자 정답이 있는 문항은 건드리지 않는다(검산은 따로 한다).

★ 여기서 고른 것을 **그대로 넣으면 안 된다.** 해설 PDF 는 구간에 따라 밀리고(중2-1 앞 단원),
  분수의 분자만 집기도 한다(0609 는 65/3 π cm² 인데 65 로 나온다).
  반드시 정답 그림과 맞대 보고 넣을 것 — 그래서 이 스크립트는 **볼 그림을 따로 모아 준다.**
"""
import io
import json
import os
import re
import shutil
import sys
from collections import Counter

read_p, img_dir, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)

pdf = json.load(io.open(read_p, encoding='utf8'))
rows = json.load(io.open(os.path.join(img_dir, 'list.json'), encoding='utf8'))
db = {r['local_no']: r for r in rows}

CIRCLE = '①②③④⑤'
UNITS = ['cm³', 'cm²', 'cm', 'mm', 'km', 'kg', 'mL', 'm', 'g', 'L', '개월', '개', '원', '명', '쪽', '권',
         '장', '자루', '마리', '송이', '바퀴', '그루', '점', '살', '주', '일', '시간', '분', '초', '년',
         '대', '℃', '℉', '%', '°', '가지']
NUM = re.compile(r'^[+-]?\d+(?:\.\d+)?$')
UN = re.compile(r'^([+-]?\d+(?:\.\d+)?)\s*(.+)$')


def clean(s):
    return re.sub(r'[ `]', ' ', s).strip()


def kind(v):
    if v == '분수':
        return '분수'
    if v and any(c in CIRCLE for c in v) and all(c in CIRCLE or c in ', ' for c in v):
        return '객관식'
    if NUM.match(v):
        return '숫자'
    m = UN.match(v)
    if m and m.group(2).strip() in UNITS:
        return '숫자+단위'
    return '식'


cand, keep = [], []
for no, raw in pdf.items():
    r = db.get(no)
    if not r or r.get('answer_text'):
        continue
    v = clean(raw)
    k = kind(v)
    if k not in ('객관식', '숫자', '숫자+단위'):
        continue
    cand.append(dict(no=no, id=r['id'], v=v, k=k))
    src = os.path.join(img_dir, f"{r['id']}.png")
    if os.path.exists(src):
        shutil.copyfile(src, os.path.join(out, f"{r['id']}.png"))
        keep.append(dict(id=r['id'], local_no=no))

json.dump(cand, io.open(os.path.join(out, 'cand.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
json.dump(keep, io.open(os.path.join(out, 'list.json'), 'w', encoding='utf8'), ensure_ascii=False)
print(f'넣을 수 있는 후보 {len(cand)} {dict(Counter(c["k"] for c in cand))}')
print(f'  정답 그림이 있는 것 {len(keep)} · 없는 것 {len(cand) - len(keep)}  → {out}')
print('※ 그림과 맞대 보기 전에는 넣지 말 것.')
