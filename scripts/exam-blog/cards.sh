# 카드뉴스 글(analysis.json)을 점검 → 스터디체크에 올리기 → 로컬로 카드 그려 보기
#   bash scripts/exam-blog/cards.sh <시험지 id> <시험 폴더 이름(예: 2026_2학기중간_신원중_중2)>
# 점검: 단원 수 = questions 에서 센 값, killers 마다 steps · checks 4개, trends 4 · strategy 4 · features 3 · hard_reasons 3 · study_steps 5
set -e
cd "$(dirname "$0")/../.."
ID=$1; F="C:/Users/USER/문제은행/기출/$2"
PYTHONIOENCODING=utf-8 python - "$F" <<'PY'
import json,io,sys
d=sys.argv[1]+"/blog/"
a=json.load(io.open(d+"analysis.json",encoding="utf-8"))
qs=a["questions"]; cnt={}
for q in qs: cnt[q["unit"]]=cnt.get(q["unit"],0)+1
assert {g["name"]:g["count"] for g in a["unit_groups"]}==cnt,(cnt,a["unit_groups"])
for k in a["killers"]: assert len(k["steps"])==4 and len(k["checks"])==4,k["no"]
assert len(a["trends"])==4 and len(a["strategy"])==4 and len(a["features"])==3 and len(a["hard_reasons"])==3 and len(a["study_steps"])==5
print("문항",len(qs),"배점합",round(sum(q.get("pts") or 0 for q in qs),1),cnt,"변별",[k["no"] for k in a["killers"]])
PY
node scripts/exam-blog/queue.mjs put-analysis $ID "$F/blog/analysis.json" 2>&1 | tail -2
npx tsx scripts/exam-blog/hit.mts $ID "$F" 2>&1 | tail -2 | head -1
python - "$F" <<'PY'
import json,io,sys,glob,os
d=sys.argv[1]+"/blog/"
a=json.load(io.open(d+"analysis.json",encoding="utf-8"))
a["hit"]=json.load(io.open(d+"hit.json",encoding="utf-8"))
for k in a["killers"]:
    n=int(k["no"]); k["image"]=f"../{n:02d}.png"
    s=glob.glob(d+f"solution_{n}.*")+glob.glob(d+f"solution_{n:02d}.*"); k["solution"]=os.path.basename(s[0]) if s else None
io.open(d+"analysis.local.json","w",encoding="utf-8").write(json.dumps(a,ensure_ascii=False,indent=1))
PY
node scripts/exam-blog/build.mjs "$F/blog/analysis.local.json" 2>&1 | grep -c 만듦
python -c "import shutil,sys; shutil.copy(sys.argv[1]+'/blog/00_thumb.png', 'C:/Users/USER/문제은행/기출/_대표썸네일/'+sys.argv[2]+'.png')" "$F" "${2#2026_2학기중간_}"
