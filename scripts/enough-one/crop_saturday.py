# 중3 토요보강 판서자료(이너프원 아님, 원장님 2026-11-16 「중3 시험대비에 같이 한 것」)를 문항별로 잘라 「기말 중3 토요보강」으로 넣는다.
# 회색 큰 번호의 y 를 쪽마다 적어 두고 그 사이를 자른다. 그다음: EO_EDITION=2026-2학기기말 sheets.py → upload.mjs images·rows·sheets
import json, os, sys, shutil
import numpy as np, pymupdf
from PIL import Image
sys.stdout.reconfigure(encoding="utf-8")
W = r"C:\Users\USER\문제은행\이너프원\2026-2학기기말"; BOOK = "기말 중3 토요보강"
TITLES = ["10/24 토요보강 최다질문 유형정리 (원과 직선·원주각)",
          "10/31 토요보강 최다질문 유형정리 (원과 직선·원주각·대푯값과 산포도)",
          "11/7 토요보강 최다질문 유형정리 (통계)"]
# 쪽마다 [왼단 번호 y들, 오른단 번호 y들] (pt) — 회색 큰 번호를 찾은 값, 9·11쪽은 보기 상자 선을 빼고 눈으로 맞춤
TOPS = {1:[[75,446],[74,446]],2:[[75,428],[75,428]],3:[[74,422],[75,422]],4:[[74,422],[75,422]],
        5:[[75,416],[74,416]],6:[[75,456],[75,456]],7:[[74,442],[75,442]],8:[[74,446],[75,446]],
        9:[[75,275,449],[75,450]],10:[[74,318,503],[74,318,579]],11:[[74,557],[74,406]],12:[[74],[]]}
X = [(18, 296), (316, 580)]; Z = 200/72
out = os.path.join(W, "crops", BOOK); shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
doc = pymupdf.open(os.path.join(W, "중3_토요보강.pdf")); man = []; no = {1:0,2:0,3:0}
for p in range(1, 13):
    si = (p - 1) // 4 + 1
    pix = doc[p-1].get_pixmap(matrix=pymupdf.Matrix(Z, Z)); im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    for (x0, x1), ys in zip(X, TOPS[p]):
        for i, y in enumerate(ys):
            y1 = ys[i+1] - 4 if i + 1 < len(ys) else 805
            c = im.crop([int(v*Z) for v in (x0, y-4, x1, y1)]); a = np.asarray(c.convert("L"))
            rows = np.where((a < 200).sum(1) > 2)[0]; cols = np.where((a < 200).sum(0) > 2)[0]
            c = c.crop((max(cols[0]-8,0), max(rows[0]-8,0), min(cols[-1]+8,c.width), min(rows[-1]+8,c.height)))
            no[si] += 1; f = f"{si:02d}_{no[si]:02d}.png"; c.save(os.path.join(out, f))
            man.append({"book":BOOK,"set":si,"set_title":TITLES[si-1],"unit":None,"no":no[si],"page":p,"file":f"{BOOK}/{f}","w":c.width,"h":c.height,"src":None})
json.dump(man, open(os.path.join(W, "crops", f"manifest_{BOOK}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(no, len(man))
