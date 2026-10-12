# 이너프원 고1 공수2 S반 — 문항별 그림 자르기 (200dpi)
#
#   python scripts/enough-one/index_hs.py            # 찾기 + 자르기 + manifest + 대조용 묶음 그림
#   python scripts/enough-one/index_hs.py debug      # 위에 더해 쪽마다 상자를 그린 확인용 그림 (_hs_work/overlay)
#
# 중등 책(index.py · crop.py)과 달리 이 PDF 에는 글자 정보가 없다 (쪽 전체가 그림).
# 그래서 문항 번호를 「글자」가 아니라 「모양」으로 찾는다. 책이 네 가지 판형을 묶은 것이라 찾는 법도 넷이다.
#   A  3~66쪽    스캔본. 번호 끝자리가 색 글자(분홍·주황·초록·보라)   → 색 덩어리
#   B  67~105쪽  최다빈출 공략. 검은 굵은 「7.」                      → 단 왼쪽 끝의 숫자+점
#   C  106~180쪽 기출 유형·교과서 문제. 파란 세 자리 번호              → 파란 덩어리 셋
#   D  181~205쪽 실전 모의고사 회차. 회색·검정 세 자리 번호            → 번호만 있는 줄
# 번호 값은 읽지 않는다. 세트 첫 번호(SETS)에서 차례로 1씩 센다 — 번호 조각 그림(_hs_work/numstrip)으로 눈으로 확인했다.
# 문항 = 번호(출처 표시 줄이 있으면 그 줄)부터 같은 단의 다음 문항·소제목 띠·쪽 아래 띠 앞까지. 아래 흰 여백은 잘라 낸다.
# 결과: crops/고1 공수2 S반/<세트 2자리>_<번호 3자리>.png · crops/manifest_고1 공수2 S반.json · sheets/고1 공수2 S반/NNN.png
import json, os, sys
import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

sys.stdout.reconfigure(encoding="utf-8")
W = r"C:\Users\USER\문제은행\이너프원\2026-2학기"
PDF = os.path.join(W, "고1_공수2_S반.pdf")
BOOK = "고1 공수2 S반"
WORK = os.path.join(W, "_hs_work")
DPI = 200
INK = 170                 # 이보다 어두우면 글자·그림 (중등 crop.py 와 같은 기준)
MARGIN = 8                # 자른 그림 위아래 여백(px)

_doc = None


def page(pg):
    """쪽 그림 (200dpi RGB 배열). 한 번 그리면 _hs_work/pages 에 두고 다시 쓴다."""
    global _doc
    p = os.path.join(WORK, "pages", f"{pg:03d}.png")
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        _doc = _doc or pymupdf.open(PDF)
        _doc[pg - 1].get_pixmap(dpi=DPI).save(p)
    return np.asarray(Image.open(p).convert("RGB"))


def comps(mask):
    """이어진 덩어리 [(x0, y0, x1, y1, 넓이)]"""
    lab, _ = ndi.label(mask, structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        out.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop, int((lab[sl] == i + 1).sum())))
    return out


def bands(rows, min_gap=1):
    """참인 줄이 이어진 구간 [(y0, y1)]"""
    out, start = [], None
    for y, v in enumerate(rows):
        if v and start is None:
            start = y
        elif not v and start is not None:
            out.append((start, y)); start = None
    if start is not None:
        out.append((start, len(rows)))
    return out


def src_top(gray, x0, x1, y):
    """번호 위에 작은 회색 글씨(출처·유형 표시)가 붙어 있으면 그 줄의 위쪽 y. 없으면 y."""
    lo = max(0, y - 130)
    rows = (gray[lo:y, x0:x1] < 205).sum(1) >= 2
    top, n = y, 0
    for b0, b1 in reversed(bands(rows)):
        b0 += lo; b1 += lo
        if top - b1 > 30 or b1 - b0 > 22 or n >= 3:      # 멀리 떨어졌거나 큰 글씨면 앞 문항이다
            break
        top, n = b0, n + 1
    return top


# ───────────────────────── 공통: 키 큰 숫자 묶음 찾기 ─────────────────────────
def digit_groups(gray, thr, hr, wr, gap, yr):
    """높이·너비가 숫자만 한 덩어리를 옆으로 이어 붙인 묶음 [[(x0,y0,x1,y1,n), …]]"""
    cs = sorted(c for c in comps(gray < thr)
                if hr[0] <= c[3] - c[1] <= hr[1] and wr[0] <= c[2] - c[0] <= wr[1] and yr[0] < c[1] < yr[1])
    groups = []
    for d in cs:
        g = next((q for q in groups if abs(q[-1][1] - d[1]) < 6 and abs(q[-1][3] - d[3]) < 6 and 0 <= d[0] - q[-1][2] < gap), None)
        if g:
            g.append(d)
        else:
            groups.append([d])
    return groups


def blank_left(gray, g, width):
    x0, y0, y1 = g[0][0], g[0][1], g[0][3]
    return (gray[y0:y1, max(0, x0 - width):x0 - 3] < 190).sum() <= 4


# ───────────────────────── A: 스캔본 (두 자리 번호, 앞자리는 회색 테두리 글자) ─────────────────────────
# 흑백으로 스캔된 쪽이 섞여 있어 색으로는 못 찾는다. 본문 글자(24px)보다 키가 큰(35px) 숫자 둘이 단 왼쪽 끝에 나란히 있으면 번호다.
def find_A(pg, a):
    wide = 32 <= pg <= 52                                   # 서술형은 한 단
    gray = a.astype(int).mean(2)
    res = []
    for g in digit_groups(gray, 205, (30, 42), (7, 26), 12, (200, 2180)):
        if len(g) != 2 or not blank_left(gray, g, 60):
            continue
        x, y = g[0][0], g[0][1]
        c = 0 if (wide or x < 550) else 1
        x0 = x - 10
        res.append({"col": c, "x0": x0, "x1": min(a.shape[1], x0 + (1318 if wide else 632)), "y": y,
                    "top": y - (46 if wide else MARGIN)})   # 서술형은 출처 표시가 번호 윗줄에 있다
    stops = []
    for x0, y0, x1, y1, n in comps(gray < 215):             # 소제목 띠 (색칠된 긴 막대)
        if x1 - x0 > 300 and 30 <= y1 - y0 <= 80 and n > 0.6 * (x1 - x0) * (y1 - y0) and y0 > 200:
            stops.append((0 if (wide or x0 < 550) else 1, y0 - 6))
    return res, stops, 2150


# ───────────────────────── B: 최다빈출 공략 (굵은 「7.」) ─────────────────────────
def find_B(pg, a):
    r = a.astype(int)
    gray = r.mean(2)
    dark = comps(gray < 140)
    dots = [c for c in dark if 4 <= c[2] - c[0] <= 9 and 4 <= c[3] - c[1] <= 9]
    res = []
    for g in digit_groups(gray, 140, (25, 31), (7, 23), 13, (120, 2150)):
        x, y, xe, ye = g[0][0], g[0][1], g[-1][2], g[0][3]
        c = 0 if x < 600 else 1
        if len(g) > 2 or abs(x - (160, 868)[c]) > 14 or not blank_left(gray, g, 28):
            continue
        if not any(0 <= d[0] - xe <= 8 and abs(d[3] - ye) <= 3 for d in dots):   # 숫자 바로 뒤 아래쪽에 점
            continue
        x0 = (150, 858)[c]
        res.append({"col": c, "x0": x0, "x1": x0 + 648, "y": y, "top": y - 12})
    # 주황색(빈출 딱지 · 빈출유형 상자 · 아래 띠)이 나오는 줄에서 문항이 끝난다
    orange = ((r.max(2) - r.min(2)) > 25) & (r[:, :, 0] > 190)
    stops = []
    for c, x0 in ((0, 150), (1, 858)):
        rows = orange[:, x0:x0 + 648].sum(1) >= 6
        stops += [(c, y0 - 2) for y0, y1 in bands(rows)]
    return res, stops, 2140


# ───────────────────────── C: 파란 세 자리 번호 (앞의 0 은 회색) ─────────────────────────
def find_C(pg, a):
    r = a.astype(int)
    gray = r.mean(2)
    blue = (r[:, :, 2] > 170) & (r[:, :, 2] - r[:, :, 0] > 70) & (r[:, :, 0] < 190)
    ds = sorted(c for c in comps(blue) if 26 <= c[3] - c[1] <= 42 and 6 <= c[2] - c[0] <= 28 and c[1] > 150)
    groups = []
    for d in ds:
        g = next((g for g in groups if abs(g[-1][1] - d[1]) < 8 and 0 <= d[0] - g[-1][2] < 18), None)   # 1 은 폭이 좁아 틈이 넓다
        if g:
            g.append(d)
        else:
            groups.append([d])
    res = []
    for g in groups:
        y, y1 = min(d[1] for d in g), max(d[3] for d in g)
        c = 0 if g[0][0] < 600 else 1
        x = (98, 852)[c]                                    # 단 왼쪽 끝 (세 자리 번호가 시작하는 곳)
        if len(g) > 3 or not (-6 <= g[0][0] - x <= 56) or g[-1][2] - x > 75:
            continue
        if (gray[y:y1, x - 2:g[-1][2]] < 200).any(0).sum() < 24:   # 회색 0 까지 합쳐 세 글자 너비가 차야 한다
            continue
        x0, x1 = x - 10, x - 10 + 722
        res.append({"col": c, "x0": x0, "x1": x1, "y": y, "top": src_top(gray, x0, x1, y - 2) - MARGIN})
    return res, [], 2215


# ───────────────────────── D: 실전 모의고사 회차 (명조 세 자리 번호만 있는 줄) ─────────────────────────
def find_D(pg, a):
    gray = a.astype(int).mean(2)
    res = []
    for g in digit_groups(gray, 205, (33, 40), (8, 32), 12, (200, 2180)):
        x, y = g[0][0], g[0][1]
        c = 0 if x < 600 else 1
        if len(g) != 3 or abs(x - (83, 853)[c]) > 10 or not blank_left(gray, g, 22):
            continue
        if (gray[y:g[0][3], g[-1][2] + 4:g[-1][2] + 300] < 190).sum() > 4:     # 번호 오른쪽은 비어 있다
            continue
        x0, x1 = x - 10, x - 10 + 722
        res.append({"col": c, "x0": x0, "x1": x1, "y": y, "top": src_top(gray, x0, x1, y - 2) - MARGIN})
    return res, [], 2185


FINDERS = [(3, 66, find_A), (67, 105, find_B), (106, 180, find_C), (181, 205, find_D)]


def find(pg):
    for p0, p1, fn in FINDERS:
        if p0 <= pg <= p1:
            a = page(pg)
            res, stops, foot = fn(pg, a)
            res.sort(key=lambda o: (o["col"], o["y"]))
            return a, res, stops, foot
    return page(pg), [], [], 0


def regions(pg):
    """그 쪽의 문항 자리 [(col, x0, top, x1, bottom)] — 읽는 차례(왼쪽 단 위→아래, 오른쪽 단)"""
    a, res, stops, foot = find(pg)
    gray = a.astype(int).mean(2) if res else None
    out = []
    for i, o in enumerate(res):
        limit = foot
        for p in res:
            if p["col"] == o["col"] and p["y"] > o["y"]:
                limit = min(limit, p["top"] - 2)
        for c, y in stops:
            if c == o["col"] and y > o["y"]:
                limit = min(limit, y)
        x0, x1 = max(0, o["x0"]), o["x1"]
        cnt = (gray[o["y"]:limit, x0:x1] < INK).sum(1)
        last = o["y"]
        for b0, b1 in reversed(bands(cnt >= 2)):            # 아래에서부터 — 스캔 얼룩(점 몇 개)은 글자로 치지 않는다
            if cnt[b0:b1].sum() >= 15:
                last = o["y"] + b1 - 1
                break
        out.append({"col": o["col"], "x0": x0, "x1": x1, "top": max(0, o["top"]), "bottom": min(limit, last + 1 + MARGIN),
                    "y": o["y"], "limit": limit})
    return a, out


def overlay(pg, a, regs, labels):
    im = Image.fromarray(a).convert("RGB")
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 34)
    for r, lab in zip(regs, labels):
        d.rectangle([r["x0"], r["top"], r["x1"], r["bottom"]], outline=(255, 0, 0), width=3)
        d.text((r["x0"] + 80, r["top"] + 2), lab, fill=(255, 0, 0), font=f)
    os.makedirs(os.path.join(WORK, "overlay"), exist_ok=True)
    im.resize((im.width // 2, im.height // 2)).save(os.path.join(WORK, "overlay", f"{pg:03d}.png"))


# ───────────────────────── 세트 ─────────────────────────
# (첫 쪽, 제목, 단원, 첫 번호)  — 세트는 늘 쪽 맨 위에서 시작한다. 첫 번호 None = 앞 세트에서 이어 센다 (C 는 책 전체가 한 줄 번호).
SETS = [
    (4, "빈출 유형 Ⅰ-1 평면좌표", "평면좌표", 1),
    (5, "빈출 유형 Ⅰ-2 직선의 방정식", "직선의 방정식", 1),
    (7, "빈출 유형 Ⅰ-3 원의 방정식", "원의 방정식", 1),
    (9, "빈출 유형 Ⅰ-4 도형의 이동", "도형의 이동", 1),
    (12, "빈출 유형 Ⅱ-1 집합", "집합", 1),
    (18, "교과서 기출 Ⅰ-1 평면좌표", "평면좌표", 1),
    (21, "교과서 기출 Ⅰ-2 직선의 방정식", "직선의 방정식", 1),
    (23, "교과서 기출 Ⅰ-3 원의 방정식", "원의 방정식", 1),
    (25, "교과서 기출 Ⅰ-4 도형의 이동", "도형의 이동", 1),
    (27, "교과서 기출 Ⅱ-1 집합", "집합", 1),
    (32, "서술형 Ⅰ-1 평면좌표", "평면좌표", 1),
    (36, "서술형 Ⅰ-2 직선의 방정식", "직선의 방정식", 1),
    (40, "서술형 Ⅰ-3 원의 방정식", "원의 방정식", 1),
    (44, "서술형 Ⅰ-4 도형의 이동", "도형의 이동", 1),
    (47, "서술형 Ⅱ-1 집합", "집합", 1),
    (54, "중간고사 대비 실전 모의고사 1회", None, 1),
    (58, "중간고사 대비 실전 모의고사 2회", None, 1),
    (62, "중간고사 대비 실전 모의고사 3회", None, 1),
    (67, "최다빈출 공략 1-1.평면좌표(01)", "평면좌표", 1),
    (71, "최다빈출 공략 1-1.평면좌표(02)", "평면좌표", 1),
    (75, "최다빈출 공략 1-2.직선의 방정식(01)", "직선의 방정식", 1),
    (79, "최다빈출 공략 1-2.직선의 방정식(02)", "직선의 방정식", 1),
    (83, "최다빈출 공략 1-3.원의 방정식(01)", "원의 방정식", 1),
    (86, "최다빈출 공략 1-3.원의 방정식(02)", "원의 방정식", 1),
    (90, "최다빈출 공략 1-4.도형의 이동(01)", "도형의 이동", 1),
    (94, "최다빈출 공략 1-4.도형의 이동(02)", "도형의 이동", 1),
    (98, "최다빈출 공략 2-1.집합(01)", "집합", 1),
    (102, "최다빈출 공략 2-1.집합(02)", "집합", 1),
    (107, "기출 유형·교과서 문제 1. 평면좌표", "평면좌표", 1),
    (110, "기출 유형·교과서 문제 2. 직선의 방정식", "직선의 방정식", None),
    (118, "기출 유형·교과서 문제 3. 원의 방정식", "원의 방정식", None),
    (124, "기출 유형·교과서 문제 4. 도형의 이동", "도형의 이동", None),
    (134, "기출 유형·교과서 문제 Ⅱ-1. 집합", "집합", None),
    (181, "실전 모의고사 1회차", None, 1),
    (185, "실전 모의고사 2회차", None, 1),
    (189, "실전 모의고사 3회차", None, 1),
    (194, "실전 모의고사 4회차", None, 1),
    (198, "실전 모의고사 5회차", None, 1),
    (202, "실전 모의고사 6회차", None, 1),
]
LAST_PAGE = 205
SKIP_NO = {}          # {(세트, 순번): 건너뛸 개수} — 책에서 번호가 빠진 곳이 있으면 적는다 (지금은 없음)


def build():
    """책 전체 문항 목록 [{set, title, unit, no, page, 자리}]"""
    items, no = [], 0
    for si, (p0, title, unit, first) in enumerate(SETS, 1):
        p1 = SETS[si][0] - 1 if si < len(SETS) else LAST_PAGE
        no = first - 1 if first else no
        k = 0
        for pg in range(p0, p1 + 1):
            a, regs = regions(pg)
            for r in regs:
                k += 1
                no += 1 + SKIP_NO.get((si, k), 0)
                items.append({"set": si, "title": title, "unit": unit, "no": no, "page": pg, **r})
    return items


def sheet_font(size):
    for f in ("malgunbd.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(os.path.join(r"C:\Windows\Fonts", f), size)
        except OSError:
            pass
    return ImageFont.load_default()


def contact_sheets(manifest):
    """대조용 묶음 그림 — 10문항씩 (가로 5 × 세로 2), 칸 왼쪽 위에 빨간 [S07-213]"""
    out_dir = os.path.join(W, "sheets", BOOK)
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        if f.endswith(".png"):
            os.remove(os.path.join(out_dir, f))
    font = sheet_font(15)
    CW, LABEL = 400, 22
    for k in range(0, len(manifest), 10):
        cells = []
        for m in manifest[k:k + 10]:
            im = Image.open(os.path.join(W, "crops", m["file"])).convert("RGB")
            sc = min((CW - 4) / im.width, 310 / im.height)
            cells.append((m, im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.LANCZOS)))
        rows = [cells[:5], cells[5:]]
        hs = [LABEL + max((c[1].height for c in r), default=0) + 6 for r in rows if r]
        sheet = Image.new("RGB", (CW * 5, sum(hs)), "white")
        d = ImageDraw.Draw(sheet)
        y = 0
        for r, h in zip(rows, hs):
            for i, (m, im) in enumerate(r):
                sheet.paste(im, (i * CW + 2, y + LABEL))
                d.rectangle([i * CW, y, i * CW + CW - 1, y + h - 1], outline=(220, 0, 0))
                d.text((i * CW + 4, y + 1), f"[S{m['set']:02d}-{m['no']}]", fill=(220, 0, 0), font=font)
            y += h
        sheet.save(os.path.join(out_dir, f"{k // 10 + 1:03d}.png"))
    print("묶음 그림:", out_dir, (len(manifest) + 9) // 10, "장")


def num_strips(items, pages):
    """번호 조각 모음 — 차례로 센 번호(빨강)와 인쇄된 번호가 맞는지 눈으로 보는 용도"""
    out_dir = os.path.join(WORK, "numstrip")
    os.makedirs(out_dir, exist_ok=True)
    font = sheet_font(20)
    CW, CH, PER, COLS = 230, 56, 150, 10
    for k in range(0, len(items), PER):
        part = items[k:k + PER]
        sheet = Image.new("RGB", (CW * COLS, CH * ((len(part) + COLS - 1) // COLS)), "white")
        d = ImageDraw.Draw(sheet)
        for i, it in enumerate(part):
            a = pages[it["page"]]
            st = Image.fromarray(a[max(0, it["y"] - 8):it["y"] + 46, max(0, it["x0"]):it["x0"] + 125])
            x, y = (i % COLS) * CW, (i // COLS) * CH
            sheet.paste(st, (x + 100, y + 1))
            d.text((x + 2, y + 14), f"{it['set']:02d}-{it['no']}", fill=(220, 0, 0), font=font)
            d.rectangle([x, y, x + CW - 1, y + CH - 1], outline=(200, 200, 200))
        sheet.save(os.path.join(out_dir, f"{k // PER + 1:02d}.png"))


def main():
    debug = "debug" in sys.argv
    items = build()
    out_dir = os.path.join(W, "crops", BOOK)
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):                           # 다시 돌릴 때 예전 그림이 남지 않게
        if f.endswith(".png"):
            os.remove(os.path.join(out_dir, f))
    manifest, pages, seen = [], {}, set()
    for it in items:
        pg = it["page"]
        if pg not in pages:
            pages[pg] = page(pg)
        name = f"{it['set']:02d}_{it['no']:03d}.png"
        assert name not in seen, name
        seen.add(name)
        im = Image.fromarray(pages[pg][it["top"]:it["bottom"], it["x0"]:it["x1"]])
        im.save(os.path.join(out_dir, name))
        manifest.append({"book": BOOK, "set": it["set"], "set_title": it["title"], "unit": it["unit"], "no": it["no"],
                         "page": pg, "file": f"{BOOK}/{name}", "w": im.width, "h": im.height, "src": None})
    path = os.path.join(W, "crops", f"manifest_{BOOK}.json")
    json.dump(manifest, open(path, "w", encoding="utf-8"), ensure_ascii=False)

    # 세트 표
    print(f"{'세트':>4} {'쪽':>9} {'문항':>4} {'번호':>9}  제목")
    for si, (p0, title, unit, first) in enumerate(SETS, 1):
        ms = [m for m in manifest if m["set"] == si]
        nos = [m["no"] for m in ms]
        ok = nos == list(range(nos[0], nos[0] + len(nos))) if nos else False
        print(f"{si:>4} {ms[0]['page']:>4}-{ms[-1]['page']:<4} {len(ms):>4} {nos[0]:>4}-{nos[-1]:<4} {'' if ok else '⚠불연속 '}{title}")
    have = {m["page"] for m in manifest}
    print("문항 없는 쪽:", [p for p in range(1, LAST_PAGE + 1) if p not in have])
    tiny = [m["file"] for m in manifest if m["h"] < 90]
    tall = [m["file"] for m in manifest if m["h"] > 1700]
    print(f"전체 {len(manifest)}문항 · 너무 작은 것 {tiny} · 아주 긴 것 {tall}")
    print("저장:", path)
    contact_sheets(manifest)
    if debug:
        num_strips(items, pages)
        by = {}
        for it in items:
            by.setdefault(it["page"], []).append(it)
        for pg, its in by.items():
            overlay(pg, pages[pg], its, [f"S{it['set']:02d}-{it['no']}" for it in its])


if __name__ == "__main__":
    main()
