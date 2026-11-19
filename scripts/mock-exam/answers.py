# 평가원 수학 정답표 PDF(홀수형 = 첫 쪽)를 읽어 answers.json 으로 만든다.
#   python scripts/mock-exam/answers.py "<회차 폴더>" [정답표 파일 이름=정답표.pdf]
# 표가 줄마다 「공통 1~11 · 공통 12~22 · 확통 · 미적 · 기하」 순서로 (번호, 정답, 배점) 세 칸씩 놓여 있다.
import json, os, re, sys, pymupdf
sys.stdout.reconfigure(encoding="utf-8")
R = sys.argv[1]; F = sys.argv[2] if len(sys.argv) > 2 else "정답표.pdf"
t = pymupdf.open(os.path.join(R, "원본", F))[0].get_text()
t = t[t.index("배점", t.index("번호")):]                       # 머리말 뒤부터
toks = re.findall(r"[①②③④⑤]|\d+", t[t.index("\n1\n"):])
tri = [toks[i:i + 3] for i in range(0, len(toks) - 2, 3)]
ans = {"공통": {}, "확통": {}, "미적": {}, "기하": {}}
it = iter(tri)
for row in range(11):
    for sec in (["공통", "공통", "확통", "미적", "기하"] if row < 8 else ["공통", "공통"]):
        no, a, p = next(it)
        ans[sec][int(no)] = {"answer": a, "pts": int(p)}
for s, v in ans.items():
    exp = range(1, 23) if s == "공통" else range(23, 31)
    assert sorted(v) == list(exp), (s, sorted(v))
tot = {s: sum(x["pts"] for x in ans["공통"].values()) + sum(x["pts"] for x in ans[s].values()) for s in ("확통", "미적", "기하")}
assert all(x == 100 for x in tot.values()), tot
json.dump(ans, open(os.path.join(R, "answers.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(R, " ".join(f"{n}{v['answer']}" for n, v in sorted(ans["공통"].items())), "|", {s: " ".join(v["answer"] for _, v in sorted(ans[s].items())) for s in ("확통", "미적", "기하")})
