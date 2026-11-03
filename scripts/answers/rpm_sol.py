# -*- coding: utf-8 -*-
"""RPM **22개정 해설 PDF** 에서 정답을 뽑는다 (2026-10-27).

  python scripts/answers/rpm_sol.py "<해설 PDF>" <나갈.json>

왜 이게 제일 좋은가
  이 해설 PDF 는 글자 층에 **교재 번호와 답이 둘 다** 남아 있다.

      0036
      (5+1)_(1+1)=12
      답 12
      …
      0046 ④ 2의 배수 중 소수는 2의 1개뿐이다.
      답 ⑤

  학원 한글본(`rpm_hwp.py`)은 숫자가 수식 개체라 `답. ` 가 빈칸이었는데, 이쪽은 숫자도 나온다.
  정답 그림을 읽을 필요가 없고, **창고에 그림이 없는 문항**(scripts/answers/정답그림_창고에없음.md)도 메울 수 있다.

★ 분수는 두 줄로 나온다 — 그래서 **숫자 하나로 보이면 함정**이다

      답 5          ← 분자
      12            ← 분모      (진짜 답은 5/12)

  이걸 그냥 담으면 「5」가 정답이 된다. 실제로 DB 에 그렇게 들어가 있던 것이 있었고,
  **틀리게 쓴 학생이 맞게 채점되는** 더 나쁜 꼴이었다(0982 는 답이 31/2 인데 DB 는 2).
  그래서 답이 숫자 하나인데 **바로 다음 줄도 세 자리 이하 숫자**면 분수로 보고 「분수」로 적어 둔다
  (분수는 학생이 칠 수 없으니 그림 그대로 둔다).
  네 자리는 **다음 문제 번호**(0037)라 분모로 보면 안 된다 — 처음에 그렇게 해서 멀쩡한 69개를 분수로 셌다.

번호는 **차례대로 나오지 않는다**
  글자를 뽑는 차례가 지면의 상자 순서를 따라가서 0001, 0002, 0007, 0003 … 처럼 뛴다.
  그래서 「번호가 커지는 순서」를 믿으면 안 된다(처음에 그렇게 했다가 102곳이 어긋났다).
  규칙은 하나다 — **번호표 하나가 바로 다음 「답」 한 줄을 갖는다.**

★ 넣기 전에 **DB 에 이미 있는 정답과 맞대 볼 것.** 판이 맞는지 보는 유일한 검사다.
"""
import io
import json
import re
import sys

import pymupdf

src, out = sys.argv[1:3]
doc = pymupdf.open(src)
lines = []
for i in range(doc.page_count):
    lines += doc[i].get_text().split('\n')

NO = re.compile(r'^(\d{4})(?:\s|$)')
ANS = re.compile(r'^답\s*(.*)$')

BARE = re.compile(r'^[+-]?\s*\d+$')

table, dup, orphan, frac = {}, [], 0, 0
cur = None
for idx, ln in enumerate(lines):
    t = ln.strip()
    m = NO.match(t)
    if m:
        if cur is not None:
            orphan += 1                    # 답을 못 만난 번호표
        cur = '%04d' % int(m.group(1))
        continue
    a = ANS.match(t)
    if a and cur:
        v = a.group(1).strip()
        if not v:
            continue
        nxt = lines[idx + 1].strip() if idx + 1 < len(lines) else ''
        if BARE.match(v) and BARE.match(nxt) and len(nxt.lstrip('+-').strip()) <= 3:
            v, frac = '분수', frac + 1      # 분자/분모가 두 줄로 나뉜 것
        if cur in table and table[cur] != v:
            dup.append((cur, table[cur], v))
        table[cur] = v
        cur = None                         # 이 번호는 답을 받았다

nums = sorted(int(k) for k in table)
print(f'뽑은 답 {len(table)} · 번호 {nums[0] if nums else 0}~{nums[-1] if nums else 0}')
miss = [n for n in range(1, (nums[-1] if nums else 0) + 1) if '%04d' % n not in table]
print(f'  답을 못 찾은 번호 {len(miss)}개' + (f' (앞 10개: {miss[:10]})' if miss else ''))
print(f'  답을 못 만난 번호표 {orphan}개 · 분수로 본 것 {frac}개(그림 그대로 둔다)')
if dup:
    print(f'  ! 한 번호에 답이 둘 ({len(dup)}곳). 앞 5개:')
    for d in dup[:5]:
        print(f'    {d[0]}: {d[1]!r} / {d[2]!r}')
json.dump(table, io.open(out, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(f'→ {out}')
print('※ 넣기 전에 DB 에 이미 있는 정답과 맞대 볼 것.')
