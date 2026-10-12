# 대조용 묶음 그림 만들기 — 10문항씩 한 장 (5칸 × 2줄, 가로 2000px), 칸마다 빨간 [S세트-번호].
#
#   python scripts/enough-one/sheets.py "고1 미래엔 평가" ["고1 천재전 평가" …]
#
# crops/manifest_<책>.json (없으면 crops/manifest.json 에서 그 책만)을 읽어 sheets/<책>/001.png … 을 만든다.
# k 번째 장 = 그 책의 (k-1)×10+1 ~ k×10 번째 문항. 적중 대조(사람 · AI)가 이 그림을 훑어 비슷한 문항을 찾는다.
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")
W = r"C:\Users\USER\문제은행\이너프원\2026-2학기"
CW, PAD, LAB = 400, 6, 30          # 칸 폭 · 안쪽 여백 · 표시 줄 높이
font = ImageFont.truetype("malgunbd.ttf", 22)


def load(book):
    own = os.path.join(W, "crops", f"manifest_{book}.json")
    if os.path.exists(own):
        return json.load(open(own, encoding="utf-8"))
    return [m for m in json.load(open(os.path.join(W, "crops", "manifest.json"), encoding="utf-8")) if m["book"] == book]


for book in sys.argv[1:]:
    items = load(book)
    out = os.path.join(W, "sheets", book)
    os.makedirs(out, exist_ok=True)
    for k in range(0, len(items), 10):
        cells = []
        for m in items[k:k + 10]:
            im = Image.open(os.path.join(W, "crops", m["file"])).convert("RGB")
            w = CW - 2 * PAD
            r = min(w / im.width, 1.0)
            im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
            if im.height > 620:                      # 너무 긴 문항은 칸을 넘기지 않게 줄인다
                r2 = 620 / im.height
                im = im.resize((int(im.width * r2), 620), Image.LANCZOS)
            cells.append((m, im))
        rows = [cells[:5], cells[5:]]
        hs = [max([c[1].height for c in r] + [1]) + LAB + PAD for r in rows if r]
        sheet = Image.new("RGB", (CW * 5, sum(hs)), "white")
        d = ImageDraw.Draw(sheet)
        y = 0
        for r, h in zip([r for r in rows if r], hs):
            for i, (m, im) in enumerate(r):
                x = i * CW
                d.rectangle([x, y, x + CW - 1, y + h - 1], outline=(200, 0, 0))
                d.text((x + 5, y + 3), f"[S{m['set']:02d}-{m['no']:02d}]", fill=(200, 0, 0), font=font)
                sheet.paste(im, (x + PAD, y + LAB))
            y += h
        sheet.save(os.path.join(out, f"{k // 10 + 1:03d}.png"))
    print(f"{book}: {len(items)}문항 → {(len(items) + 9) // 10}장")
