# 이너프원 PDF 색인 만들기 — 책마다 「세트(회차) > 문항」 목록과 문항 자리를 뽑는다.
#
#   python scripts/enough-one/index.py
#
# 이너프원은 학생 이름이 찍힌 사본이 여러 부씩 들어 있다. 내용은 같으므로 판마다 한 부만 쓴다
# (C:\Users\USER\문제은행\이너프원\2026-2학기 에 풀어 둔 것).
# 문항 번호는 PDF 안에 큰 글자(16.5pt·18pt)로 들어 있어 그 자리가 곧 문항의 왼쪽 위다.
# 결과: 같은 폴더의 index.json  (책 > 세트 > 문항[쪽, 단, 번호, 자리, 출처표시])
import json, os, re, sys
import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
W = r"C:\Users\USER\문제은행\이너프원\2026-2학기"

# 파일 → (누구 책인지, 권)
BOOKS = {
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
        d = pymupdf.open(os.path.join(W, f))
        sets = []
        for i in range(len(d)):
            page = d[i]
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
        total = sum(len(s["problems"]) for s in sets)
        print(f"\n===== {name} ({f}) — {len(d)}쪽 · 세트 {len(sets)}개 · 문항 {total}개")
        for s in sets:
            nos = [p["no"] for p in s["problems"]]
            ok = nos == list(range(1, len(nos) + 1))
            tagged = sum(1 for p in s["problems"] if p["src"])
            print(f"  {s['first_page']:>3}-{s['last_page']:<3} {len(nos):>3}문항 {'' if ok else '⚠번호불연속 '}"
                  f"{(s['title'] or '?'):<28} [{s['unit'] or ''}]" + (f" 쎈출처 {tagged}" if tagged else ""))
        index.append({"book": name, "file": f, "pages": len(d), "sets": sets})
    with open(os.path.join(W, "index.json"), "w", encoding="utf-8") as fp:
        json.dump(index, fp, ensure_ascii=False)
    print("\n저장:", os.path.join(W, "index.json"))


if __name__ == "__main__":
    main()
