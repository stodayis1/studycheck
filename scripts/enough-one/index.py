# 이너프원 PDF 색인 만들기 — 책마다 「세트(회차) > 문항」 목록과 문항 자리를 뽑는다.
#
#   python scripts/enough-one/index.py
#
# 이너프원은 학생 이름이 찍힌 사본이 여러 부씩 들어 있다. 내용은 같으므로 판마다 한 부만 쓴다
# (C:\Users\USER\문제은행\이너프원\2026-2학기 에 풀어 둔 것).
# 문항 번호는 PDF 안에 큰 글자(16.5pt·18pt)로 들어 있어 그 자리가 곧 문항의 왼쪽 위다.
# 결과: 같은 폴더의 index.json  (책 > 세트 > 문항[쪽, 단, 번호, 자리, 출처표시])
import json, os, re, sys
import numpy as np
import pymupdf
from scipy import ndimage as ndi

sys.stdout.reconfigure(encoding="utf-8")
# 판(EO_EDITION): 2026-2학기 = 중간고사용 · 2026-2학기기말 = 기말고사용 (2026-11 원장님이 준 8권)
EDITION = os.environ.get("EO_EDITION", "2026-2학기")
W = os.path.join(r"C:\Users\USER\문제은행\이너프원", EDITION)

# 파일 → (누구 책인지, 권)
BOOKS_FINAL = {
    "중1_상.pdf": "기말 중1 상", "중1_중.pdf": "기말 중1 중", "중1_하.pdf": "기말 중1 하",
    "중2_상.pdf": "기말 중2 상", "중2_중.pdf": "기말 중2 중", "중2_하.pdf": "기말 중2 하",
    "신원중3_상.pdf": "기말 신원중3 상", "신원중3_중.pdf": "기말 신원중3 중",
}
BOOKS_MID = {
    "중2_상.pdf": "중2 상",
    "중2_중.pdf": "중2 중",
    "중2_하.pdf": "중2 하",
    "신원중3_1권_A(59MB).pdf": "신원중3 1권 A",
    "신원중3_1권_B(84MB).pdf": "신원중3 1권 B",
    "신원중3_2권_A(110MB).pdf": "신원중3 2권 A",
    "신원중3_2권_B(103MB).pdf": "신원중3 2권 B",
    "타학교중3_1권.pdf": "타학교중3 1권",
    "타학교중3_2권.pdf": "타학교중3 2권",
}
BOOKS = BOOKS_FINAL if EDITION == "2026-2학기기말" else BOOKS_MID
ONLY = sys.argv[1:]                      # 책 이름을 주면 그 책만

# 그림 PDF 는 세트 제목을 못 읽는다 → 세트 첫 쪽 머리말을 눈으로 읽어 적어 둔 것 (차례대로, 머리말의 문항 수와 센 수가 맞는 것 확인)
_M1 = ["1. 기본도형", "2. 작도와 합동", "3. 다각형", "4. 원과 부채꼴", "5. 다면체와 회전체", "6. 입체도형의 겉넓이와 부피", "7. 자료의 정리와 해석"]
_M2 = ["2. 평행선 사이의 선분의 길이의 비", "3. 삼각형의 무게중심과 닮음의 활용", "4. 피타고라스의 정리와 활용", "5. 경우의 수", "6. 확률"]
IMG_TITLES = {
    "기말 중1 상": [f"{t} - 1회차" for t in _M1] + [f"{t} - 2회차" for t in _M1]
                 + ["[신원중1] 비상 교과서 실력/심화 문제", "[신원중1] 비상 교과서 익힘책 - 실력/심화 문제"],
    "기말 중2 상": [x for t in _M2 for x in (f"{t} - 1회차", f"{t} - 쎈C")] + [f"{t} - 2회차" for t in _M2]
                 + [f"중등2-2 [교과서 - 비상] 대단원 마무리 - {k}회" for k in (1, 2, 3)],
    "기말 중2 중": [f"{t} - 1회차" for t in _M2] + [f"{t} - 2회차" for t in _M2]
                 + [f"중등2-2 [교과서 - 천재(김동재)] 대단원 마무리 - {k}회" for k in (1, 2, 3)],
    "기말 중2 하": [f"{t} - 1회차" for t in _M2] + [f"{t} - 2회차" for t in _M2]
                 + [f"중등2-2 [교과서 - 비상] 대단원 마무리 - {k}회" for k in (1, 2, 3)],
}

FOOT_Y = 790          # 이 아래는 쪽 번호·학습번호
TITLE_RE = re.compile(r"(★?\s?\d+\.\s?[^\d★][^★]*?-\s?\d회차|\*?[가-힣 ]+\(\d\)(?:\s?-\s?\d회차)?|\*?[가-힣 ]+-\s?종합\s?\d회차|\*?[가-힣 ]+\s?-\s?\d회차|[가-힣 ]+\(\d\)-\d회차|[가-힣 ]+-\d회차)")


def spans(page):
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["text"].strip():
                    yield s


def anchors(page):
    """문항 번호 자리 [(번호, 단, x, y)]"""
    digits = []
    for s in spans(page):
        t = s["text"].replace(" ", "")
        if not t.isdigit() or s["size"] < 16 or s["size"] > 19:
            continue
        x, y = s["bbox"][0], s["bbox"][1]
        if y < 55 or y > FOOT_Y:
            continue
        col = 0 if x < 200 else 1
        if (col == 0 and x > 60) or (col == 1 and not (300 < x < 350)):
            continue
        digits.append((col, round(y), x, t))
    # 같은 줄의 숫자 조각을 왼쪽부터 이어 붙인다 ('0' + '1' → 01)
    rows = {}
    for col, y, x, t in digits:
        key = next((k for k in rows if k[0] == col and abs(k[1] - y) <= 3), (col, y))
        rows.setdefault(key, []).append((x, t))
    out = []
    for (col, y), parts in rows.items():
        no = int("".join(t for _, t in sorted(parts)))
        out.append((no, col, min(x for x, _ in parts), y))
    return sorted(out, key=lambda a: (a[1], a[3]))


# ── 글자 정보가 없는 PDF(쪽 전체가 그림) — 파란 두 자리 번호를 모양으로 찾는다.
# 글자 PDF(중1 중)의 번호 자리와 견주어 1pt 안에서 맞는 것을 확인했다. 번호 값은 못 읽으므로 세트 안에서 차례로 센다.
Z = 200 / 72


def page_array(page):
    pix = page.get_pixmap(dpi=200)
    return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3].astype(int)


def img_anchors(a):
    """[(None, 단, x, y)] — 단 왼쪽 끝의 파란 두 자리 숫자"""
    blue = (a[:, :, 2] > 150) & (a[:, :, 2] - a[:, :, 0] > 60)
    lab, _ = ndi.label(blue, np.ones((3, 3)))
    ds = []
    for sl in ndi.find_objects(lab):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        x, y = sl[1].start / Z, sl[0].start / Z
        if not (30 <= h <= 48 and 6 <= w <= 70) or y < 55 or y > FOOT_Y:      # 두 숫자가 붙은 「40」은 한 덩어리(폭 60px 안팎)
            continue
        col = 0 if x < 200 else 1
        if (col == 0 and x > 60) or (col == 1 and not (300 < x < 350)):
            continue
        ds.append((col, y, x, w))
    rows = {}
    for col, y, x, w in ds:
        key = next((k for k in rows if k[0] == col and abs(k[1] - y) <= 3), (col, y))
        rows.setdefault(key, []).append((x, w))
    out = [(None, col, min(x for x, _ in xs), y - 1) for (col, y), xs in rows.items()
           if len(xs) == 2 or (len(xs) == 1 and xs[0][1] >= 45)]
    return sorted(out, key=lambda o: (o[1], o[3]))


def img_title_page(a):
    """세트 첫 쪽: 왼쪽 위 제목 글씨가 크다 (첫 쪽 45px 안팎 · 나머지 27px)"""
    band = a[int(15 * Z):int(60 * Z), int(15 * Z):int(280 * Z)].mean(2) < 150
    rows = np.where(band.any(1))[0]
    return bool(len(rows)) and rows.max() - rows.min() >= 38


def source_tags(page):
    """문항 위의 출처 표시: 쌍[쎈] 중등 2-2 P.12 0021번"""
    flat = re.sub(r"\s+", " ", page.get_text())
    return re.findall(r"쌍\s?\[(쎈B?)\]\s?중등\s?(\d-\d)\s?P\.(\d+)\s?(\d+)번", flat)


def set_key(page):
    t = page.get_text()
    m = re.search(r"학습번호:\s*(\d+)", t)
    return m.group(1) if m else None


def title_of(page):
    flat = re.sub(r"\s+", " ", page.get_text())
    flat = re.sub(r"이름\s?:\s?\S+", "", flat)
    m = TITLE_RE.search(flat)
    return re.sub(r"\s+", " ", m.group(1)).strip(" *★") if m else None


def unit_of(page):
    flat = re.sub(r"\s+", " ", page.get_text())
    m = re.search(r"출제단원 - (.+?) \d+ / \d+", flat)
    return m.group(1).strip() if m else None


def main():
    index = []
    for f, name in BOOKS.items():
        if ONLY and name not in ONLY:
            continue
        d = pymupdf.open(os.path.join(W, f))
        sets = []
        image_pdf = sum(len(d[i].get_text().strip()) for i in range(min(6, len(d)))) == 0
        for i in range(len(d)):
            page = d[i]
            if image_pdf:
                arr = page_array(page)
                a = img_anchors(arr)
                if not a:
                    continue                               # 빈 쪽 · 정답 쪽
                if not sets or img_title_page(arr):
                    sets.append({"id": None, "title": None, "unit": None, "first_page": i + 1, "problems": []})
                s = sets[-1]
                s["last_page"] = i + 1
                for _, col, x, y in a:
                    s["problems"].append({"no": len(s["problems"]) + 1, "page": i + 1, "col": col, "x": round(x), "y": round(y), "src": None})
                continue
            a = anchors(page)
            if not a and len(page.get_text().strip()) < 40:
                continue                                   # 빈 쪽 (세트 사이 간지)
            key = set_key(page)
            title = title_of(page)
            new = not sets or (key and key != sets[-1]["id"]) or (not key and a and a[0][0] == 1 and sets[-1]["problems"])
            if new:
                sets.append({"id": key, "title": title, "unit": unit_of(page), "first_page": i + 1, "problems": []})
            s = sets[-1]
            s["last_page"] = i + 1
            if not s["title"] and title:
                s["title"] = title
            tags = source_tags(page)
            for n, (no, col, x, y) in enumerate(a):
                s["problems"].append({"no": no, "page": i + 1, "col": col, "x": round(x), "y": y,
                                      "src": list(tags[n]) if len(tags) == len(a) else None})
        if image_pdf and name in IMG_TITLES:
            if len(IMG_TITLES[name]) != len(sets):
                print(f"⚠ {name}: 적어 둔 제목 {len(IMG_TITLES[name])}개 · 찾은 세트 {len(sets)}개 — 제목을 넣지 않음")
            else:
                for s_, t in zip(sets, IMG_TITLES[name]):
                    s_["title"] = t
        total = sum(len(s["problems"]) for s in sets)
        print(f"\n===== {name} ({f}) — {len(d)}쪽 · 세트 {len(sets)}개 · 문항 {total}개")
        for s in sets:
            nos = [p["no"] for p in s["problems"]]
            ok = nos == list(range(1, len(nos) + 1))
            tagged = sum(1 for p in s["problems"] if p["src"])
            print(f"  {s['first_page']:>3}-{s['last_page']:<3} {len(nos):>3}문항 {'' if ok else '⚠번호불연속 '}"
                  f"{(s['title'] or '?'):<28} [{s['unit'] or ''}]" + (f" 쎈출처 {tagged}" if tagged else ""))
        index.append({"book": name, "file": f, "pages": len(d), "sets": sets})
    if ONLY and os.path.exists(os.path.join(W, "index.json")):     # 한 권만 다시 만들 때는 나머지 책을 그대로 둔다
        index = [b for b in json.load(open(os.path.join(W, "index.json"), encoding="utf-8")) if b["book"] not in ONLY] + index
    with open(os.path.join(W, "index.json"), "w", encoding="utf-8") as fp:
        json.dump(index, fp, ensure_ascii=False)
    print("\n저장:", os.path.join(W, "index.json"))


if __name__ == "__main__":
    main()
