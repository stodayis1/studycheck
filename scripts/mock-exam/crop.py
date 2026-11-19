# 모의고사 문제지 PDF 를 문항별 그림으로 자른다 (200dpi).
#   python scripts/mock-exam/crop.py "<회차 폴더>" [문제지 파일 이름=문제지.pdf] [쪽 수 제한]
# 쪽마다 머리말의 「(확률과 통계)·(미적분)·(기하)」 글자로 과목을 가르고, 없으면 공통.
# 고1·고2 학평처럼 선택과목이 없으면 모두 「공통」 폴더에 들어간다.
# 문항 번호 「N.」 글자 위치로 자르고, 쪽 맨 아래 「확인 사항」 상자 위에서 멈춘다.
# 글자 정보가 없는 그림 PDF 는 자르지 못한다 → 알려 주고 멈춘다.
# EBSi 고3 학평 PDF 는 선택과목마다 따로(공통 22 + 그 과목 8) 있고 머리말로 가를 수 없다
#   → 4번째 인자로 과목을 주면 23~30번을 그 과목으로 넣는다:  crop.py "<회차>" 문제지_미적.pdf 0 미적
import pymupdf, re, os, sys, numpy as np
from PIL import Image
sys.stdout.reconfigure(encoding="utf-8")
R = sys.argv[1]; F = sys.argv[2] if len(sys.argv) > 2 else "문제지.pdf"
LIMIT = int(sys.argv[3]) if len(sys.argv) > 3 and int(sys.argv[3]) > 0 else None
FORCE = sys.argv[4] if len(sys.argv) > 4 else None
d = pymupdf.open(os.path.join(R, "원본", F)); Z = 200 / 72
W = d[0].rect.width; MID = W / 2
COLS = [(W * 0.083, MID - 5), (MID + 1, W * 0.917)]
out = []
for pi in range(len(d) if LIMIT is None else LIMIT):
    p = d[pi]; txt = p.get_text()
    head = p.get_text(clip=pymupdf.Rect(0, 0, p.rect.width, p.rect.height * 0.12))   # 과목은 머리말에서만 (쪽 아래 확인 사항에도 과목 이름이 있다)
    if len(txt.strip()) < 20: print("글자 없는 쪽", pi + 1); continue
    sec = "확통" if "확률과 통계" in head else "미적" if "미적분" in head else "기하" if "기하" in head else "공통"
    ws = p.get_text("words")
    pix = p.get_pixmap(matrix=pymupdf.Matrix(Z, Z)); im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    bottom = p.rect.height * 0.894
    for x0, x1 in COLS:
        hs = sorted([(w[1], int(w[4][:-1])) for w in ws if re.fullmatch(r"\d{1,2}\.", w[4]) and x0 <= w[0] < x0 + 40])
        for k, (y, no) in enumerate(hs):
            stop = [w[1] for w in ws if w[4] == "확인" and x0 <= w[0] < x1 and w[1] > y]
            y1 = hs[k + 1][0] - 8 if k + 1 < len(hs) else (min(stop) - 14 if stop else bottom)
            # 위쪽: 번호 줄보다 높이 솟은 분수·지수가 잘리지 않게 넉넉히(45pt) 잡은 뒤,
            # 번호 줄에서 위로 올라가며 빈 줄이 12px(약 4pt) 이어지는 곳에서 끊는다 → 앞 문항 끝·머리말 줄은 빠진다
            top = max(y - 45, hs[k - 1][0] + 4 if k > 0 else p.rect.height * 0.06)
            c = im.crop([int(v * Z) for v in (x0, top, x1, y1)]); a = np.asarray(c.convert("L"))
            ink = (a < 200).sum(1) > 1
            r = int((y - top) * Z); gap = 0; first = r
            while r > 0:
                r -= 1
                if ink[r]: first = r; gap = 0
                else:
                    gap += 1
                    if gap >= 12: break
            a2 = a[first:]
            rows = np.where((a2 < 200).sum(1) > 1)[0]; cols = np.where((a2 < 200).sum(0) > 1)[0]
            c = c.crop((max(cols[0] - 10, 0), max(first + rows[0] - 10, 0), min(cols[-1] + 10, c.width), min(first + rows[-1] + 10, c.height)))
            s_ = FORCE if FORCE and no >= 23 else ("공통" if FORCE else sec)
            os.makedirs(os.path.join(R, "crops", s_), exist_ok=True)
            c.save(os.path.join(R, "crops", s_, f"{no:02d}.png")); out.append((s_, no))
by = {}
for s, n in out: by.setdefault(s, []).append(n)
print(len(out), {s: sorted(v) for s, v in by.items()})
