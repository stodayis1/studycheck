# -*- coding: utf-8 -*-
"""빠른 정답 목록의 번호 덩어리를 **OCR 로 읽는다**.

  python aocr.py            → anums.json 을 읽어 aocr.json 을 만든다

왜 OCR 인가 — 2026-09-22 에는 글자 모양을 군집으로 해독해 번호를 **꽂았다**.
그러다 덩어리 하나를 잘못 찾으면 개수가 우연히 맞아 **엉뚱한 번호가 들어갔다**
(`aassign.py` 의 「개수만 같으면 1:1 로 꽂는다」). 419문항이 어긋났다.

이번에는 번호를 **확인하는 데만** 쓴다. 자리 순서가 곧 번호이고, OCR 은 그것이 맞는지 본다.
어긋나면 조용히 메우지 않고 **그 자리를 비운다**.
"""
import io
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

from adet import apage

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
# ★ 임시 그림 이름에 프로세스 번호를 넣는다 — 같은 이름을 쓰면 이 파일을 **두 번 돌릴 때**
#   서로의 그림을 읽는다. 2026-11-04 에 그렇게 0010 자리에서 0385 가 나왔고,
#   OCR 이 62군데에서 어긋나 번호 확정이 1174 → 746 으로 무너졌다. 에러는 안 난다.
TMP = f'_t{os.getpid()}.png'
rows = json.load(io.open('anums.json', encoding='utf8'))
# 빠른 정답 목록은 1~7쪽이다. **7쪽은 왼쪽 단만** — 오른쪽 단은 「부록 대단원 모의고사」라
# 번호가 01·02… 로 다시 시작한다. 그것까지 넣으면 자리 순서가 통째로 어긋난다.
FIRST = int(sys.argv[1]) if len(sys.argv) > 1 else 1
LAST = int(sys.argv[2]) if len(sys.argv) > 2 else 7
OUT = sys.argv[3] if len(sys.argv) > 3 else 'aocr.json'
rows = [r for r in rows if FIRST <= r['pg'] <= LAST and not (r['pg'] == 7 and r['half'] == 1)]
print(f'번호 덩어리 {len(rows)}개 ({FIRST}~{LAST}쪽)')

out = []
cache = {}
for k, r in enumerate(rows):
    if r['pg'] not in cache:
        cache.clear()
        cache[r['pg']] = apage(r['pg'])
    im = cache[r['pg']]
    H, W = im.shape[:2]
    a = im[max(0, r['y0'] - 3):min(H, r['y1'] + 3), max(0, r['x0'] - 3):min(W, r['x1'] + 3)]
    g = Image.fromarray(a.astype(np.uint8)).convert('L')
    g = g.resize((g.width * 4, g.height * 4), Image.LANCZOS)     # 작은 글씨는 키워야 읽는다
    g.save(TMP)
    p = subprocess.run([TESS, TMP, 'stdout', '--psm', '7', '-c',
                        'tessedit_char_whitelist=0123456789'],
                       capture_output=True, text=True)
    t = ''.join(c for c in p.stdout if c.isdigit())
    out.append(t)
    if k % 200 == 0:
        print(f'  {k}/{len(rows)}', flush=True)
if os.path.exists(TMP):
    os.remove(TMP)
json.dump([dict(r, ocr=t) for r, t in zip(rows, out)], io.open(OUT, 'w', encoding='utf8'))
ok = sum(1 for t in out if len(t) == 4)
print(f'읽음 {ok}/{len(out)} (네 자리로 읽힌 것)')
