# 교과서 출판사 자료(평가문제 · 교과서 문제, 한글 작업본 PDF)를 문항별 그림으로 자른다 (200dpi).
#
#   python scripts/enough-one/crop_eval.py            # 전부
#   python scripts/enough-one/crop_eval.py "고1 미래엔 교과서"   # 한 권만
#
# 고1 은 학교마다 교과서가 달라, 그 출판사 자료를 시험 전에 풀린다 (신원고 = 미래엔, 동산고 = 천재(전)).
#   · 평가문제(중단원 · 대단원): 2026 2학기 중간은 두 학교 범위가 같아 두 출판사 것을 다 풀렸다 → 두 학교 모두 대조에 쓴다
#   · 교과서 문제: 자기 학교 교과서만 풀었다 → 신원고는 미래엔, 동산고는 천재(전)만   (원장님 2026-10-10)
#
# 이 PDF 들은 글자 정보가 있고 2단(가운데 세로줄)이다. 문항 번호 「7.」 이 단 왼쪽 끝에 찍혀 있다 = 문항의 시작.
# 뒤쪽 풀이 · 정답 쪽도 같은 번호를 쓰지만 1로 되돌아가므로 거기서 멈춘다.
# 단의 범위와 본문 위아래는 쪽마다 가운데 세로줄에서 읽는다 (판형이 책마다 달라서).
# 문항 아래 풀이 여백과 다음 문항 위의 소제목은 잘라 낸다 (큰 빈 띠에서 끊는다).
# 교과서는 번호 줄 바로 위에 「문제 1 · 예제 2 · 생각 열기」 딱지가 있어 그것까지 넣는다 (lead).
# 결과: crops/<책>/<세트 2자리>_<문항 2~3자리>.png  +  crops/manifest_<책>.json   (이너프원 crop.py 와 같은 모양)
import glob, json, os, re, sys
import pymupdf
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
W = r"C:\Users\USER\문제은행\이너프원\2026-2학기"
DPI = 200
Z = DPI / 72
INK = 200
GAP = 45                            # 이만큼(pt) 비어 있으면 그 문항은 거기서 끝난 것
NUM = re.compile(r"^(\d+)\.$")

EVAL_TITLES = ["중단원평가 1-1 평면좌표와 직선의 방정식", "중단원평가 1-2 원의 방정식", "중단원평가 1-3 도형의 이동", "중단원평가 2-1 집합",
               "대단원평가 1 도형의 방정식", "대단원평가 2 집합과 명제"]
EVAL_UNITS = ["평면좌표와 직선의 방정식", "원의 방정식", "도형의 이동", "집합", "도형의 방정식", "집합과 명제"]
# 책 → 원본 폴더, 세트 순서(파일 이름에 든 말), 세트 제목 · 단원, lead(번호 줄 위로 더 넣을 높이 pt)
BOOKS = {
    "고1 미래엔 평가": dict(src="고1_교과서평가/미래엔", lead=3, titles=EVAL_TITLES, units=EVAL_UNITS,
                       files=["중단원평가_1-1", "중단원평가_1-2", "중단원평가_1-3", "중단원평가_2-1", "대단원평가_1", "대단원평가_2"]),
    "고1 천재전 평가": dict(src="고1_교과서평가/천재전", lead=3, titles=EVAL_TITLES, units=EVAL_UNITS,
                       files=["중단원평가문제_1-1", "중단원평가문제_1-2", "중단원평가문제_1-3", "중단원평가문제_2-1", "대단원평가문제_1", "대단원평가문제_2"]),
    "고1 미래엔 교과서": dict(src="고1_교과서", lead=20, titles=["교과서 Ⅰ 도형의 방정식", "교과서 Ⅱ 집합과 명제"], units=["도형의 방정식", "집합과 명제"],
                        files=["미래엔_1", "미래엔_2"]),
    "고1 천재전 교과서": dict(src="고1_교과서", lead=20, titles=["교과서 Ⅰ 도형의 방정식", "교과서 Ⅱ 집합과 명제"], units=["도형의 방정식", "집합과 명제"],
                        files=["천재전_1", "천재전_2"]),
}


def geometry(page):
    """가운데 세로줄에서 두 단의 범위와 본문 위아래를 읽는다 → (단 [(x0,x1),(x0,x1)], top, bottom). 줄이 없으면 None"""
    w = page.rect.width
    best = None
    for r in page.get_drawings():
        rc = r["rect"]
        if rc.width < 2 and rc.height > 300 and abs(rc.x0 - w / 2) < 60:
            if best is None or rc.height > best.height:
                best = rc
    if best is None:
        return None
    mid = best.x0
    words = page.get_text("words")
    inside = [x for x in words if best.y0 - 2 <= x[1] <= best.y1 + 2]
    left = min([x[0] for x in inside if x[0] < mid] or [mid - 320]) - 4
    right = max([x[2] for x in inside if x[0] > mid] or [mid + 320]) + 4
    right = max(right, mid + (mid - left))          # 오른쪽 단이 짧게 끝나는 쪽에서도 폭을 같게
    return [(left, mid - 4), (mid + 4, right)], best.y0 + 1, best.y1 - 1


def anchors(page, cols, size=None):
    """단 왼쪽 끝의 「7.」. size 를 주면 그 글자 크기만 — 문항 안의 (1. 2. 3.) 소문항이나 풀이 쪽 번호는 크기가 다르다"""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                m = NUM.match(s["text"].strip())
                if m and s["size"] >= 8 and (size is None or abs(s["size"] - size) < 0.5):
                    x0, y0 = s["bbox"][0], s["bbox"][1]
                    col = 0 if x0 < cols[1][0] - 5 else 1
                    if abs(x0 - cols[col][0]) < 12:
                        out.append({"no": int(m.group(1)), "col": col, "y": y0, "size": s["size"]})
    return out


def crop(page, colx, y0, y1, anchor_y):
    x0, x1 = colx
    pix = page.get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=pymupdf.Rect(x0, y0, x1, y1))
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    g = img.convert("L")
    px = g.load()
    inked = [any(px[x, y] < INK for x in range(0, g.width, 2)) for y in range(g.height)]
    start = max(0, int((anchor_y - y0) * Z))     # 번호 줄. 그 위(lead)는 딱지가 있을 때만 남는다
    if not any(inked[start:]):
        return None
    first = next((y for y in range(0, start + 1) if inked[y]), start)
    last, blank = start, 0
    for y in range(start, g.height):
        if inked[y]:
            last, blank = y, 0
        else:
            blank += 1
            if blank > GAP * Z:
                break
    return img.crop((0, max(0, first - 6), img.width, min(img.height, last + 9)))


def main():
    only = sys.argv[1:] or list(BOOKS)
    for book in only:
        cfg = BOOKS[book]
        out = os.path.join(W, "crops", book)
        os.makedirs(out, exist_ok=True)
        for f in glob.glob(os.path.join(out, "*.png")):
            os.remove(f)
        manifest = []
        for si, key in enumerate(cfg["files"], 1):
            files = [f for f in glob.glob(os.path.join(W, cfg["src"], "*.pdf")) if key in os.path.basename(f)]
            if len(files) != 1:
                print(f"⚠ {book} 세트 {si}: 파일을 하나로 찾지 못했습니다 ({key})", files); sys.exit(1)
            d = pymupdf.open(files[0])
            expect, done, nos = 1, False, []
            size = None                                  # 첫 「1.」 의 글자 크기 = 이 파일의 문항 번호 크기
            for pi in range(len(d)):
                page = d[pi]
                geo = geometry(page)
                if geo is None:
                    continue
                cols, top, bottom = geo
                A = anchors(page, cols, size)
                if size is None:
                    one = [a for a in A if a["no"] == 1]
                    if not one:
                        continue
                    size = one[0]["size"]
                    A = [a for a in A if abs(a["size"] - size) < 0.5]
                for c in (0, 1):
                    col = sorted([a for a in A if a["col"] == c], key=lambda a: a["y"])
                    for i, a in enumerate(col):
                        if a["no"] != expect:            # 번호가 이어지지 않으면 풀이 쪽이 시작된 것
                            done = True
                            break
                        prev = col[i - 1]["y"] + 12 if i else top
                        y0 = max(top, prev, a["y"] - cfg["lead"])
                        y1 = col[i + 1]["y"] - cfg["lead"] - 1 if i + 1 < len(col) else bottom
                        img = crop(page, cols[c], y0, max(y1, a["y"] + 10), a["y"] - 1)
                        # (미래엔 교과서 Ⅱ 14쪽은 PDF 자체에 흰 상자가 위쪽을 덮고 있어 58~60번이 안 보인다 — 원본 한글 파일을 고쳐야 한다)
                        if img is None:
                            print(f"⚠ {book} 세트 {si} {a['no']}번: 내용이 없습니다"); expect += 1; continue
                        name = f"{si:02d}_{a['no']:02d}.png"
                        img.save(os.path.join(out, name))
                        manifest.append({"book": book, "set": si, "set_title": cfg["titles"][si - 1], "unit": cfg["units"][si - 1], "no": a["no"],
                                         "page": pi + 1, "file": f"{book}/{name}", "w": img.width, "h": img.height, "src": None})
                        nos.append(a["no"]); expect += 1
                    if done:
                        break
                if done:
                    break
            print(f"{book} · 세트 {si} {cfg['titles'][si - 1]}: {len(nos)}문항 (1~{nos[-1] if nos else 0}) · {len(d)}쪽")
        json.dump(manifest, open(os.path.join(W, "crops", f"manifest_{book}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        hs = [m["h"] for m in manifest] or [0]
        print(f"→ {book}: {len(manifest)}문항 · 높이 {min(hs)}~{max(hs)}px · 폭 {sorted(set(m['w'] for m in manifest))[:6]}")


if __name__ == "__main__":
    main()
