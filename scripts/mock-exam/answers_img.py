# 학평 정답(EBSi 정답 그림을 눈으로 읽어 적은 글)과 문제지 PDF 의 「[N점]」으로 answers.json 을 만든다.
#   python scripts/mock-exam/answers_img.py "<회차 폴더>" "<정답 글>" [선택과목 글 …]
#   정답 글 = "1③ 2④ … 22 8 23 4 …" 처럼 번호 뒤에 답 (단답은 띄어 쓴다)
#   고3 은 공통 글 다음에 "확통:23③ … 30 9" "미적:…" "기하:…" 를 더 준다.
# 배점은 그 문항을 자른 자리 안의 「[N점]」 글자에서 읽고, 과목마다 합이 100 인지 확인한다.
import json, os, re, sys, glob, pymupdf
sys.stdout.reconfigure(encoding="utf-8")
R = sys.argv[1]
def parse(s):
    return {int(n): a for n, a in re.findall(r"(\d+)\s*([①②③④⑤]|\d+)(?=\s|$)", s.strip())}
ans = {"공통": parse(sys.argv[2])}
for extra in sys.argv[3:]:
    sec, body = extra.split(":", 1); ans[sec] = parse(body)
# 배점: 원본 PDF 들에서 「N.」 과 그 뒤 첫 「[k점]」 을 짝짓는다 (같은 단 안에서 아래로)
pts = {}
for pdf in sorted(glob.glob(os.path.join(R, "원본", "*.pdf"))):
    sec_of = os.path.basename(pdf).replace("문제지", "").replace(".pdf", "").strip("_") or None
    d = pymupdf.open(pdf); W = d[0].rect.width; MID = W / 2
    for p in d:
        ws = p.get_text("words")
        for x0, x1 in [(0, MID), (MID, W)]:
            col = sorted([w for w in ws if x0 <= w[0] < x1], key=lambda w: (round(w[1]), w[0]))
            cur = None
            for w in col:
                if re.fullmatch(r"\d{1,2}\.", w[4]) and w[0] < x0 + W * 0.13: cur = int(w[4][:-1]); continue
                m = re.search(r"\[(\d)점\]", w[4])
                if m and cur is not None:
                    key = ("공통" if cur <= 22 or not sec_of else sec_of, cur)
                    pts.setdefault(key, int(m.group(1))); cur = None
out = {}
for sec, a in ans.items():
    out[sec] = {}
    for n, v in sorted(a.items()):
        k = (sec, n) if (sec, n) in pts else ("공통", n)
        out[sec][str(n)] = {"answer": v, "pts": pts.get(k)}
miss = [f"{s}{n}" for s, v in out.items() for n, x in v.items() if x["pts"] is None]
assert not miss, ("배점 못 읽음", miss)
com = sum(x["pts"] for x in out["공통"].values())
sels = [s for s in out if s != "공통"]
tot = {s: com + sum(x["pts"] for x in out[s].values()) for s in sels} if sels else {"공통": com}
exp_n = 22 if sels else 30
assert len(out["공통"]) == exp_n and all(len(out[s]) == 8 for s in sels), {s: len(v) for s, v in out.items()}
assert all(v == 100 for v in tot.values()), ("배점 합", tot)
json.dump(out, open(os.path.join(R, "answers.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(os.path.basename(R), "OK", tot)
