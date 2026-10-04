# 이너프원 문항별 그림 자르기 (200dpi) — index.py 가 만든 index.json 을 읽는다.
#
#   python scripts/enough-one/crop.py            # 전부
#   python scripts/enough-one/crop.py "중2 하"   # 한 권만
#
# 문항 자리 = 번호 글자의 왼쪽 위. 같은 단의 다음 번호(없으면 쪽 아래 띠) 전까지가 그 문항이다.
# 아래 흰 여백과 풀이용 옅은 줄은 잘라 낸다. 학생 이름이 찍힌 머리말은 문항 자리 밖이라 들어가지 않는다.
# 결과: crops/<책>/<세트순번 2자리>_<문항 2자리>.png  +  crops/manifest.json
import json, os, sys
import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
W = r"C:\Users\USER\문제은행\이너프원\2026-2학기"
DPI = 200
Z = DPI / 72
COLS = [(18, 298), (303, 580)]      # 두 단의 가로 범위 (pt)
FOOT_Y = 790
INK = 170                           # 이보다 어두우면 글자·그림으로 본다 (풀이용 옅은 줄은 무시)


def last_ink_row(pix):
    """아래에서부터 훑어 글자가 있는 마지막 줄 (없으면 0)"""
    w, h, n, s = pix.width, pix.height, pix.n, pix.samples
    for y in range(h - 1, -1, -1):
        row = s[y * w * n:(y + 1) * w * n]
        if min(row) < INK:
            return y
    return 0


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    index = json.load(open(os.path.join(W, "index.json"), encoding="utf-8"))
    manifest = []
    for book in index:
        if only and book["book"] != only:
            continue
        d = pymupdf.open(os.path.join(W, book["file"]))
        out_dir = os.path.join(W, "crops", book["book"])
        os.makedirs(out_dir, exist_ok=True)
        n_ok, tiny, tall = 0, [], []
        for si, s in enumerate(book["sets"], 1):
            # 쪽·단별로 문항을 위에서 아래로 늘어놓는다
            by = {}
            for p in s["problems"]:
                by.setdefault((p["page"], p["col"]), []).append(p)
            for (pg, col), plist in by.items():
                plist.sort(key=lambda p: p["y"])
                for i, p in enumerate(plist):
                    top = p["y"] - 4
                    bottom = (plist[i + 1]["y"] - 22) if i + 1 < len(plist) else FOOT_Y     # 다음 문항의 출처 표시 줄 위까지
                    x0, x1 = COLS[col]
                    clip = pymupdf.Rect(x0, top, x1, bottom)
                    pix = d[pg - 1].get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=clip, colorspace=pymupdf.csGRAY)
                    cut = min(pix.height, last_ink_row(pix) + 1 + round(Z * 3))
                    pix = d[pg - 1].get_pixmap(matrix=pymupdf.Matrix(Z, Z),
                                               clip=pymupdf.Rect(x0, top, x1, top + cut / Z))
                    name = f"{si:02d}_{p['no']:02d}.png"
                    pix.save(os.path.join(out_dir, name))
                    if pix.height < 90: tiny.append(name)
                    if pix.height > 1900: tall.append(name)
                    manifest.append({"book": book["book"], "set": si, "set_title": s["title"], "unit": s["unit"],
                                     "no": p["no"], "page": pg, "file": f"{book['book']}/{name}",
                                     "w": pix.width, "h": pix.height, "src": p["src"]})
                    n_ok += 1
        print(f"{book['book']}: {n_ok}문항 자름" + (f" · 너무 작은 것 {len(tiny)} {tiny[:6]}" if tiny else "")
              + (f" · 쪽 끝까지 찬 것 {len(tall)} {tall[:6]}" if tall else ""), flush=True)
    path = os.path.join(W, "crops", "manifest.json" if not only else f"manifest_{only}.json")
    json.dump(manifest, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print("저장:", path, len(manifest))


if __name__ == "__main__":
    main()
