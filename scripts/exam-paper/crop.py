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
    spans = [s for b in page.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"] if s["text"].strip()]
    out = []
    for s in spans:
        m = MARK.match(s["text"].strip())
        if m and s["size"] < 9:
            x0, y0, x1, y1 = s["bbox"]
            col = 0 if x0 < cols[1][0] - 5 else 1
            if abs(x0 - cols[col][0]) < 12:          # 단의 맨 왼쪽에 있는 것만
                # 번호가 문제 첫 줄과 **같은 줄**에 찍힌 파일도 있다 (「10) 다음 중 옳지 않은 것은?」).
                # 그때는 번호 줄 아래부터 자르면 첫 줄이 날아간다 → 그 줄 위에서부터 자르고 번호 글자만 지운다
                same = [t for t in spans if t is not s and abs(t["origin"][1] - s["origin"][1]) < 4
                        and t["bbox"][0] >= x1 - 1 and t["bbox"][0] < cols[col][1]]
                top = min([t["bbox"][1] for t in same] + [y0]) - 2 if same else None
                out.append({"no": int(m.group(1)), "col": col, "y0": y0, "y1": y1, "top": top, "box": (x0, y0, x1, y1)})
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
    erase = {}           # (쪽, 문항번호) → 같은 줄에 찍힌 번호 글자의 자리 (그림에서 지운다)
    answers_page = None
    for pi in range(len(d)):
        page = d[pi]
        cols = col_bounds(page)
        ms = markers(page, cols)
        words = page.get_text("words")
        n_mark = sum(1 for w in words if MARK.match(w[4]))
        # 미주(정답) 목록 쪽: 번호만 줄줄이 있거나, 작은 미주 번호 없이 「1) ③」 줄이 5개 넘게 있는 쪽
        n_line = len(re.findall(r"(?m)^\s*\d+\)", page.get_text()))
        if (n_mark >= 5 and n_mark >= 0.4 * len(words) and not page.get_images()) or (not ms and n_line >= 5):
            answers_page = pi
            continue
        bottom = max([w[3] for w in page.get_text("words")] + [b["bbox"][3] for b in page.get_text("dict")["blocks"]] + [0]) + 4
        for c in (0, 1):
            cm = sorted([m for m in ms if m["col"] == c], key=lambda m: m["y0"])
            y = 0
            for m in cm:
                start = m["top"] if m["top"] is not None else m["y1"] + 1      # 번호가 첫 줄과 같은 줄이면 그 줄 위에서부터
                cut = (m["top"] if m["top"] is not None else m["y0"]) - 1
                if cut > y + 1:
                    stream.append((pi, c, cols[c], y, cut, None))      # 앞 문항의 이어지는 부분
                stream.append((pi, c, cols[c], start, None, m["no"]))
                if m["top"] is not None:
                    erase[(pi, m["no"])] = m["box"]
                y = start
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
        if no is not None and (pi, no) in erase:
            bx0, by0, bx1, by1 = erase[(pi, no)]
            yy = max(y0, 30)
            img.paste((255, 255, 255), (max(0, int((bx0 - x0) * Z) - 1), max(0, int((by0 - yy) * Z) - 1), int((bx1 - x0) * Z) + 3, int((by1 - yy) * Z) + 2))
        rows = ink_rows(img)
        if rows:
            cur["parts"].append(img.crop((0, max(0, rows[0] - 6), img.width, min(img.height, rows[1] + 8))))

    manifest = []
    essay_ranges = []    # 「[논술형17~20]」 로 알린 서술형 번호 범위
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
        pts = re.search(r"[\[(]\s*(\d+(?:\.\d+)?)\s*점\s*[\])]", text)          # [4점] 또는 (4점)
        # 「[논술형17~20]」 같은 묶음 표시는 그 문항이 아니라 뒤 문항들의 것이다 → 떼고 본다
        own = re.sub(r"\[\s*(논술|서술)형\s*\d+\s*[~∼\-]\s*\d+\s*\]", "", text)
        for r in re.finditer(r"(논술|서술)형\s*(\d+)\s*[~∼\-]\s*(\d+)", text):
            essay_ranges.append((int(r.group(2)), int(r.group(3))))
        manifest.append({"no": p["no"], "page": p["page"], "file": name, "w": w, "h": h, "parts": len(p["parts"]),
                         "points": float(pts.group(1)) if pts else None,          # [3점] — 비어 있으면 None
                         "essay": bool(re.search(r"서술|논술|풀이 과정|물음에 답하시오|\[\s*총", own)),
                         "choices": sum(1 for c in "①②③④⑤" if c in text),
                         "text": text[:300]})

    for m in manifest:
        if any(a <= m["no"] <= b for a, b in essay_ranges):
            m["essay"] = True

    # 3) 미주 목록에서 정답 읽기: 「3) ④」
    #    번호는 1부터 차례로 찾는다 (정답 글 안에 「(1)」 같은 괄호가 있어도 헷갈리지 않게).
    #    ①~⑤ 나 숫자 하나가 아닌 정답(논술형·수식)은 글자로 옮기면 수식이 빠지므로 그 자리를 그림으로도 잘라 둔다.
    answers, answer_images = {}, {}
    if answers_page is not None:
        page = d[answers_page]
        cols = col_bounds(page)
        marks = []                                            # (번호, 단, y0)
        want = 1
        for c in (0, 1):
            ws = sorted([w for w in page.get_text("words") if (w[0] >= cols[1][0] - 5) == (c == 1)], key=lambda w: (round(w[1]), w[0]))
            for w in ws:
                if w[4] == f"{want})" and abs(w[0] - cols[c][0]) < 14:
                    marks.append((want, c, w[1], w[2]))
                    want += 1
        bottom = max([w[3] for w in page.get_text("words")] + [0]) + 6
        for i, (no, c, y0, xr) in enumerate(marks):
            nxt = marks[i + 1] if i + 1 < len(marks) and marks[i + 1][1] == c else None
            y1 = nxt[2] - 1 if nxt else bottom
            x0, x1 = cols[c]
            text = re.sub(r"\s+", " ", page.get_text("text", clip=pymupdf.Rect(xr + 1, y0 - 1, x1, y1))).strip()
            text = re.sub(r"^(논술|서술)형?\s*\d+\s*[.)]\s*", "", text)
            if re.fullmatch(r"[①②③④⑤,\s]+", re.sub(r"[^\w①②③④⑤,]", "", text) or " "):     # 빈 수식 틀 같은 찌꺼기 글자는 버린다
                text = re.sub(r"[^①②③④⑤,]", "", text)
            if not text:
                continue
            answers[no] = text
            if not re.fullmatch(r"[①②③④⑤,\s]+|-?\d+(\.\d+)?", text):
                pix = page.get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=pymupdf.Rect(xr + 1, y0 - 9, x1, y1 - 4))   # 분수는 번호 줄보다 위로 올라온다
                img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                # 맨 윗줄에 닿아 있는 글자 = 윗 정답(분수 아랫부분 등)의 꼬리 → 첫 빈 줄까지 버린다
                #   줄 간격이 좁아 빈 줄이 없을 수 있으므로, 윗줄에 닿은 글자 덩어리만 따라가며 지운다
                gp = img.convert("L").load(); ip = img.load()
                todo = [(x, 0) for x in range(img.width) if gp[x, 0] < INK]
                seen = set(todo)
                while todo:
                    x, y = todo.pop()
                    ip[x, y] = (255, 255, 255)
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x + 1, y + 1), (x - 1, y + 1)):
                        if 0 <= nx < img.width and ny < min(img.height, 30) and (nx, ny) not in seen and gp[nx, ny] < 235:
                            seen.add((nx, ny)); todo.append((nx, ny))
                rows = ink_rows(img)
                if rows:
                    name = f"ans_{no:02d}.png"
                    img.crop((0, max(0, rows[0] - 6), img.width, min(img.height, rows[1] + 8))).save(os.path.join(out, name))
                    answer_images[no] = name
    # 배점이 수식으로 찍혀 글자로 안 읽히는 문항은 points.json ({"7": 4, …})에 적어 두면 그 값을 쓴다
    over = {}
    if os.path.exists(os.path.join(out, "points.json")):
        over = json.load(open(os.path.join(out, "points.json"), encoding="utf-8"))
    for m in manifest:
        m["answer"] = answers.get(m["no"])
        m["answer_image"] = answer_images.get(m["no"])
        if str(m["no"]) in over:
            m["points"] = float(over[str(m["no"])])
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
