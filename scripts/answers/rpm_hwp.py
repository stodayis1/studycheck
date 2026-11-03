# -*- coding: utf-8 -*-
"""RPM 한글본 PDF 에서 **객관식 정답**을 뽑는다 (2026-10-27 중1-1 에서 처음 씀).

  python scripts/answers/rpm_hwp.py "<한글본 PDF 가 든 폴더>" <나갈.json>

왜 쓰나
  RPM 은 학원이 가진 한글본(단원별 .hwp/.pdf)에 풀이가 글자로 들어 있다.
  풀이마다 `73) 답. ①, ③` 꼴로 답이 붙어 있고, 그 **73 이 교재 번호 0073 과 그대로 같다**
  (문제편 쪽의 `[0107~0110]` 묶음 번호로 확인했다 — 단원이 바뀌어도 번호가 이어진다).

  → 객관식은 그림을 읽지 않고 여기서 가져온다. 그림 판독의 **대조 원본**으로도 쓴다.

못 가져오는 것
  숫자·식 답은 한글이 **수식 개체**로 넣어 글자 층에 안 남는다(`74) 답. ` 처럼 빈칸).
  그건 정답 그림을 읽어야 한다.
"""
import io
import json
import os
import re
import sys

import pymupdf

src, out = sys.argv[1], sys.argv[2]
files = sorted(f for f in os.listdir(src) if f.lower().endswith('.pdf'))

CIRCLE = '①②③④⑤'
# 판마다 꼴이 조금씩 다르다 — `73) 답. ①, ③`(중1-1 22개정) · `103. 답 ④`(중1-2 2018)
# 답 뒤 그 줄 끝까지만 본다.
PAT = re.compile(r'(\d{1,4})\s*[.)]\s*답\s*[.．]?\s*([^\n]*)')

table, blank, odd = {}, [], []
for fn in files:
    doc = pymupdf.open(os.path.join(src, fn))
    text = '\n'.join(doc[i].get_text() for i in range(doc.page_count))
    doc.close()
    hit = 0
    for m in PAT.finditer(text):
        no = '%04d' % int(m.group(1))
        v = m.group(2).strip().rstrip('.')
        if not v:
            blank.append(no)                       # 수식 개체라 글자가 안 남은 것
            continue
        # 동그라미만 남긴다(「①, ③」·「④」). 그 밖은 그림을 읽어야 한다.
        only = ''.join(c for c in v if c in CIRCLE)
        if only and all(c in CIRCLE or c in ', ' for c in v):
            want = ', '.join(only)
            if no in table and table[no] != want:
                odd.append((no, table[no], want))
            table[no] = want
            hit += 1
        else:
            blank.append(no)
    print(f'  {fn[:52]:<52} 객관식 {hit}')

print(f'\n뽑은 객관식 {len(table)} · 글자로 안 남은 것 {len(set(blank))}')

# ★ 같은 번호가 두 번 다른 값으로 나오면 **그 한글본은 이 교재의 판이 아니다**.
#   중1-2 는 2018년 판뿐이라 번호가 어긋났고(실력UP 묶음이 1번부터 다시 센다),
#   DB 와 맞대 보니 121개 중 110개가 달랐다. 그대로 넣었으면 전부 오답이 됐을 것이다.
if odd:
    for o in odd[:10]:
        print(f'  ! 같은 번호 {o[0]} 이 {o[1]} 과 {o[2]} 로 두 번 나온다')
    print(f'\n번호가 겹친다 ({len(odd)}곳) — 이 한글본은 교재와 **판이 다르거나** 묶음마다 번호를 다시 센다.')
    print('그대로 쓰면 엉뚱한 답이 들어간다. 쓰지 말 것.')
    sys.exit(1)

json.dump(table, io.open(out, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(f'→ {out}')
print('※ 넣기 전에 DB 에 이미 있는 정답과 맞대 볼 것 — 그게 판이 맞는지 보는 유일한 검사다.')
