# 교과서 출판사 평가문제(중단원평가 · 대단원평가, 한글 작업본 PDF)를 문항별 그림으로 자른다 (200dpi).
#
#   python scripts/enough-one/crop_eval.py
#
# 고1 은 학교마다 교과서가 달라, 그 출판사의 평가문제를 시험 전에 풀린다 (신원고 = 미래엔, 동산고 = 천재(전)).
# 2026 2학기 중간은 두 학교 범위가 같아 두 출판사 것을 다 풀렸다 → 둘 다 적중 대조에 쓴다 (원장님 2026-10-10).
#
# 이 PDF 들은 글자 정보가 있고 양식이 같다: 728×1031pt, 2단(가운데 세로줄 x=364), 위 줄 y≈94 · 아래 줄 y≈952.
# 문항 번호 「7.」 이 13pt 로 단 왼쪽에 찍혀 있다 = 문항의 시작. 뒤쪽 풀이 쪽은 번호가 11.5pt 라 걸리지 않는다
# (번호가 1로 되돌아가면 거기서 멈춘다 — 풀이가 시작된 것).
# 문항 아래 풀이 여백, 그리고 다음 문항 위의 「기본 · 표준 · 서술형」 딱지는 잘라 낸다 (큰 빈 띠에서 끊는다).
# 결과: crops/<책>/<세트 2자리>_<문항 2자리>.png  +  crops/manifest_<책>.json   (이너프원 crop.py 와 같은 모양)
import glob, json, os, re, sys
import pymupdf
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
W = r"C:\Users\USER\문제은행\이너프원\2026-2학기"
SRC = os.path.join(W, "고1_교과서평가")
DPI = 200
Z = DPI / 72
INK = 200
COLS = [(38, 360), (368, 692)]      # 두 단의 가로 범위 (pt) — 가운데 세로줄(364)은 뺀다
TOP, BOTTOM = 96, 950               # 위 · 아래 가로줄 사이가 본문
GAP = 45                            # 이만큼(pt) 비어 있으면 그 문항은 거기서 끝난 것 (아래는 풀이 여백이나 다음 문항의 딱지)
NUM = re.compile(r"^(\d+)\.$")

# 폴더 → (자른 폴더 이름, 세트 순서: 파일 이름에 들어 있는 말)
BOOKS = {
    "미래엔": ("고1 미래엔 평가", ["중단원평가_1-1", "중단원평가_1-2", "중단원평가_1-3", "중단원평가_2-1", "대단원평가_1", "대단원평가_2"]),
    "천재전": ("고1 천재전 평가", ["중단원평가문제_1-1", "중단원평가문제_1-2", "중단원평가문제_1-3", "중단원평가문제_2-1", "대단원평가문제_1", "대단원평가문제_2"]),
}
TITLES = ["중단원평가 1-1 평면좌표와 직선의 방정식", "중단원평가 1-2 원의 방정식", "중단원평가 1-3 도형의 이동", "중단원평가 2-1 집합",
          "대단원평가 1 도형의 방정식", "대단원평가 2 집합과 명제"]
UNITS = ["평면좌표와 직선의 방정식", "원의 방정식", "도형의 이동", "집합", "도형의 방정식", "집합과 명제"]


def anchors(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                m = NUM.match(s["text"].strip())
                if m and s["size"] >= 8.5:          # 문항 번호는 13pt (천재 1-2 만 9pt). 풀이 쪽 번호도 걸리지만 1로 되돌아가므로 거기서 멈춘다
                    x0, y0 = s["bbox"][0], s["bbox"][1]
                    col = 0 if x0 < 364 else 1
                    if abs(x0 - COLS[col][0]) < 12:
                        out.append({"no": int(m.group(1)), "col": col, "y": y0})
    return out


def crop(page, col, y0, y1):
    x0, x1 = COLS[col]
    pix = page.get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=pymupdf.Rect(x0, y0, x1, y1))
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    g = img.convert("L")
    px = g.load()
    inked = [any(px[x, y] < INK for x in range(0, g.width, 2)) for y in range(g.height)]
    if not any(inked):
        return None
    first = inked.index(True)
    last, blank = first, 0
    for y in range(first, g.height):
        if inked[y]:
            last, blank = y, 0
        else:
            blank += 1
            if blank > GAP * Z:
                break
    return img.crop((0, max(0, first - 6), img.width, min(img.height, last + 9)))


def main():
    for folder, (book, order) in BOOKS.items():
        out = os.path.join(W, "crops", book)
        os.makedirs(out, exist_ok=True)
        manifest = []
        for si, key in enumerate(order, 1):
            files = [f for f in glob.glob(os.path.join(SRC, folder, "*.pdf")) if key in os.path.basename(f)]
            if len(files) != 1:
                print(f"⚠ {book} 세트 {si}: 파일을 하나로 찾지 못했습니다 ({key})", files); sys.exit(1)
            d = pymupdf.open(files[0])
            expect, done, nos = 1, False, []
            for pi in range(len(d)):
                page = d[pi]
                A = anchors(page)
                for c in (0, 1):
                    col = sorted([a for a in A if a["col"] == c], key=lambda a: a["y"])
                    for i, a in enumerate(col):
                        if a["no"] != expect:            # 번호가 이어지지 않으면 풀이 쪽이 시작된 것
                            done = True
                            break
                        y1 = col[i + 1]["y"] - 4 if i + 1 < len(col) else BOTTOM
                        img = crop(page, c, max(TOP, a["y"] - 3), y1)
                        if img is None:
                            print(f"⚠ {book} 세트 {si} {a['no']}번: 내용이 없습니다"); continue
                        name = f"{si:02d}_{a['no']:02d}.png"
                        img.save(os.path.join(out, name))
                        manifest.append({"book": book, "set": si, "set_title": TITLES[si - 1], "unit": UNITS[si - 1], "no": a["no"],
                                         "page": pi + 1, "file": f"{book}/{name}", "w": img.width, "h": img.height, "src": None})
                        nos.append(a["no"]); expect += 1
                    if done:
                        break
                if done:
                    break
            print(f"{book} · 세트 {si} {TITLES[si - 1]}: {len(nos)}문항 (1~{nos[-1] if nos else 0}) · {len(d)}쪽")
        json.dump(manifest, open(os.path.join(W, "crops", f"manifest_{book}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        hs = [m["h"] for m in manifest]
        print(f"→ {book}: {len(manifest)}문항 · 높이 {min(hs)}~{max(hs)}px · 폭 {sorted(set(m['w'] for m in manifest))}")


if __name__ == "__main__":
    main()
