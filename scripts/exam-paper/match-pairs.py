# 적중 대조 결과를 눈으로 확인하려고 「기출 | 이너프원 후보」를 나란히 붙인 그림을 만든다.
#
#   python scripts/exam-paper/match-pairs.py "<시험 폴더>" "<결과 폴더>" [문항당 후보 수=3]
#
# <시험 폴더> 의 NN.png (기출 문항)과 matches_*.json (서브에이전트가 쓴 후보:
#   {"matches":[{"no","book","set","pno","level","memo"}]}) 을 읽어, 문항마다 정도가 높은 후보를 옆에 붙인다.
# 3문항씩 한 장(pair_NN-NN.png). 이걸 직접 열어 보고 정도를 고친 뒤 add-matches-by-set.mjs 로 넣는다.
import glob, json, os, sys
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")
D, OUT = sys.argv[1], sys.argv[2]
TOP = int(sys.argv[3]) if len(sys.argv) > 3 else 3
E = r"C:\Users\USER\문제은행\이너프원\2026-2학기\crops"
L = ["쌍둥이", "매우 유사", "유형 유사", "참고"]
os.makedirs(OUT, exist_ok=True)

ms = []
for f in sorted(glob.glob(os.path.join(D, "matches_*.json"))):
    ms += json.load(open(f, encoding="utf-8"))["matches"]
by = {}
for m in ms:
    by.setdefault(int(m["no"]), []).append(m)
font = ImageFont.truetype("malgun.ttf", 20)
W = 440


def fit(im, w=W, hmax=560):
    r = min(w / im.width, hmax / im.height)
    return im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)


rows = []
for no in sorted(by):
    seen, cands = set(), []
    for m in sorted(by[no], key=lambda m: L.index(m["level"])):
        k = (m["book"], int(m["set"]), int(m["pno"]))
        if k not in seen:
            seen.add(k); cands.append(m)
    ims = [fit(Image.open(os.path.join(D, f"{no:02d}.png")).convert("RGB"))]
    labs = [f"기출 {no}번"]
    for m in cands[:TOP]:
        p = os.path.join(E, m["book"], f"{int(m['set']):02d}_{int(m['pno']):02d}.png")
        if not os.path.exists(p):          # 고1 공수2 S반은 번호가 3자리다 (01_006.png)
            p = os.path.join(E, m["book"], f"{int(m['set']):02d}_{int(m['pno']):03d}.png")
        if not os.path.exists(p):
            print("없음", p); continue
        ims.append(fit(Image.open(p).convert("RGB")))
        labs.append(f"{m['book']} S{int(m['set']):02d}-{int(m['pno']):02d} [{m['level']}]")
    h = max(i.height for i in ims) + 36
    row = Image.new("RGB", ((W + 10) * (TOP + 1), h), "white")
    d = ImageDraw.Draw(row)
    for i, (im, lab) in enumerate(zip(ims, labs)):
        d.text((i * (W + 10) + 4, 4), lab, fill=(200, 0, 0), font=font)
        row.paste(im, (i * (W + 10), 34))
    d.line([(0, h - 1), (row.width, h - 1)], fill=(0, 0, 0), width=2)
    rows.append((no, row))

for i in range(0, len(rows), 3):
    grp = rows[i:i + 3]
    sheet = Image.new("RGB", ((W + 10) * (TOP + 1), sum(r.height for _, r in grp)), "white")
    y = 0
    for _, r in grp:
        sheet.paste(r, (0, y)); y += r.height
    name = os.path.join(OUT, f"pair_{grp[0][0]:02d}-{grp[-1][0]:02d}.png")
    sheet.save(name)
    print(name, sheet.size)
print(len(ms), "후보 ·", len(by), "문항:", sorted(by))
