# 학교 기출 PDF(한글에서 변환한 것)를 문항별 그림으로 자른다 (200dpi).
#
#   python scripts/exam-paper/crop.py "<기출.pdf>" "<결과 폴더>"
#
# 한글 작업 파일은 2단 편집이고, 문항마다 맨 앞에 작은 미주 번호 「3)」가 찍혀 있다.
# 그 번호가 문항의 시작이다. 한 문항이 다음 단·다음 쪽으로 넘어가면 조각을 이어 붙인다.
# 마지막 쪽의 「1) 2) 3) …」 목록(미주 = 정답 칸)은 문항이 아니다 — 정답으로 따로 읽는다.
# 결과: 01.png … + manifest.json (번호, 쪽, 크기, 정답)
import json, os, re, sys
import pymupdf
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
DPI = 200
Z = DPI / 72
INK = 200            # 이보다 어두우면 글자·그림
MARK = re.compile(r"^(\d+)\)$")


def col_bounds(page):
    """두 단의 가로 범위 — 가운데 세로선을 찾아 나눈다 (없으면 쪽 한가운데)"""
    mid = page.rect.width / 2
    for r in page.get_drawings():
        rc = r["rect"]
        if rc.width < 2 and rc.height > 200 and abs(rc.x0 - mid) < 40:
            mid = rc.x0
            break
    words = page.get_text("words")
    xs0 = [w[0] for w in words if w[0] < mid] or [40]
    xs1 = [w[2] for w in words if w[0] > mid] or [page.rect.width - 40]
    left = min(xs0) - 3
    right = max(xs1) + 3
    return [(left, mid - 4), (mid + 5, max(right, mid + 5 + (mid - 4 - left)))]


def markers(page, cols):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                m = MARK.match(s["text"].strip())
                if m and s["size"] < 9:
                    x0, y0, x1, y1 = s["bbox"]
                    col = 0 if x0 < cols[1][0] - 5 else 1
                    if abs(x0 - cols[col][0]) < 12:          # 단의 맨 왼쪽에 있는 것만
                        out.append({"no": int(m.group(1)), "col": col, "y0": y0, "y1": y1})
    return out


def ink_rows(img):
    """글자가 있는 첫 줄·마지막 줄 (없으면 None)"""
    g = img.convert("L")
    w, h = g.size
    px = g.load()
    first = last = None
    for y in range(h):
        if any(px[x, y] < INK for x in range(0, w, 2)):
            first = y if first is None else first
            last = y
    return (first, last) if first is not None else None


def main():
    pdf, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    d = pymupdf.open(pdf)

    # 1) 쪽·단 순서대로 훑으며 「번호 자리」와 「단 끝」을 한 줄로 늘어놓는다
    stream = []          # (쪽, 단, 단 범위, y시작, y끝, 문항번호 또는 None)
    answers_page = None
    for pi in range(len(d)):
        page = d[pi]
        cols = col_bounds(page)
        ms = markers(page, cols)
        words = page.get_text("words")
        n_mark = sum(1 for w in words if MARK.match(w[4]))
        if n_mark >= 5 and n_mark >= 0.4 * len(words) and not page.get_images():
            answers_page = pi                                 # 번호만 줄줄이 있는 쪽 = 미주(정답) 목록
            continue
        bottom = max([w[3] for w in page.get_text("words")] + [b["bbox"][3] for b in page.get_text("dict")["blocks"]] + [0]) + 4
        for c in (0, 1):
            cm = sorted([m for m in ms if m["col"] == c], key=lambda m: m["y0"])
            y = 0
            for m in cm:
                if m["y0"] > y + 2:
                    stream.append((pi, c, cols[c], y, m["y0"] - 1, None))      # 앞 문항의 이어지는 부분
                stream.append((pi, c, cols[c], m["y1"] + 1, None, m["no"]))
                y = m["y1"] + 1
            # 마지막 조각의 끝 = 단 끝
            if stream and stream[-1][0] == pi and stream[-1][1] == c and stream[-1][4] is None:
                s = stream[-1]
                stream[-1] = (s[0], s[1], s[2], s[3], bottom, s[5])
            elif not cm:
                stream.append((pi, c, cols[c], 0, bottom, None))
        # 번호 다음 조각의 끝을 다음 번호 직전으로
        for i, s in enumerate(stream):
            if s[4] is None:
                nxt = stream[i + 1]
                stream[i] = (s[0], s[1], s[2], s[3], nxt[3] if nxt[5] is None else nxt[3] - 8, s[5])

    # 2) 문항별로 조각을 모아 세로로 이어 붙인다
    problems, cur = [], None
    for pi, c, (x0, x1), y0, y1, no in stream:
        if no is not None:
            cur = {"no": no, "page": pi + 1, "parts": [], "text": ""}
            problems.append(cur)
        if cur is None or y1 - y0 < 3:
            continue
        cur["text"] += " " + d[pi].get_text("text", clip=pymupdf.Rect(x0, max(y0, 30), x1, y1))
        pix = d[pi].get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=pymupdf.Rect(x0, max(y0, 30), x1, y1))
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        rows = ink_rows(img)
        if rows:
            cur["parts"].append(img.crop((0, max(0, rows[0] - 6), img.width, min(img.height, rows[1] + 8))))

    manifest = []
    for p in problems:
        if not p["parts"]:
            print(f"⚠ {p['no']}번: 내용이 없습니다")
            continue
        w = max(i.width for i in p["parts"])
        h = sum(i.height for i in p["parts"]) + 10 * (len(p["parts"]) - 1)
        sheet = Image.new("RGB", (w, h), "white")
        y = 0
        for i in p["parts"]:
            sheet.paste(i, (0, y))
            y += i.height + 10
        name = f"{p['no']:02d}.png"
        sheet.save(os.path.join(out, name))
        text = re.sub(r"\s+", " ", p["text"]).strip()
        pts = re.search(r"\[\s*(\d+(?:\.\d+)?)\s*점\s*\]", text)
        manifest.append({"no": p["no"], "page": p["page"], "file": name, "w": w, "h": h, "parts": len(p["parts"]),
                         "points": float(pts.group(1)) if pts else None,          # [3점] — 비어 있으면 None
                         "essay": bool(re.search(r"서술|풀이 과정", text)),
                         "choices": sum(1 for c in "①②③④⑤" if c in text),
                         "text": text[:300]})

    # 3) 미주 목록에서 정답 읽기: 「3) ④」
    answers = {}
    if answers_page is not None:
        flat = re.sub(r"\s+", " ", d[answers_page].get_text())
        for m in re.finditer(r"(\d+)\)\s*([^)]*?)(?=\s*\d+\)|$)", flat):
            if m.group(2).strip():
                answers[int(m.group(1))] = m.group(2).strip()
    # 배점: 문항 글 안의 [3점]
    for m in manifest:
        m["answer"] = answers.get(m["no"])
    nos = [m["no"] for m in manifest]
    json.dump({"pdf": os.path.basename(pdf), "pages": len(d), "problems": manifest},
              open(os.path.join(out, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(manifest)}문항 · 번호 {nos[0]}~{nos[-1]} {'연속' if nos == list(range(1, len(nos) + 1)) else '⚠불연속'}"
          f" · 폭 {sorted(set(m['w'] for m in manifest))}px · 높이 {min(m['h'] for m in manifest)}~{max(m['h'] for m in manifest)}px"
          f" · 이어 붙인 문항 {[m['no'] for m in manifest if m['parts'] > 1]} · 정답 {len(answers)}개")
    print(f"배점 합계 {sum(m['points'] or 0 for m in manifest):g}점 · 배점이 비어 있는 문항 {[m['no'] for m in manifest if m['points'] is None]}"
          f" · 서술형 {[m['no'] for m in manifest if m['essay']]} · 보기 5개가 아닌 객관식 {[m['no'] for m in manifest if not m['essay'] and m['choices'] != 5]}")


if __name__ == "__main__":
    main()
