import json, base64, io, html, re
from PIL import Image
M=[m for m in json.load(open('q_meta.json')) if m['bch']==1]
A=json.load(open('a_meta.json')); D=json.load(open('diff.json'))
STD={1:'다항식의 덧셈과 뺄셈',2:'전개식에서 계수 구하기',3:'곱셈 공식을 이용한 전개',4:'공통부분이 있는 전개',5:'x²+y², x³+y³의 값',6:'x²+1/x², x³+1/x³의 값',7:'a²+b²+c², a³+b³+c³의 값',8:'곱셈 공식을 이용한 수의 계산',9:'나눗셈: 몫과 나머지',10:'나눗셈: A=BQ+R',11:'몫과 나머지의 변형',12:'도형에의 활용'}
BOOK2STD={1:1,2:2,3:3,4:4,5:5,6:7,7:8,8:9,9:11,10:12}
PER={24:6,25:6,26:6,36:10,38:10,39:10,40:10,   # 책 유형 안에서 갈라지는 것
     48:1,49:2,50:3,51:5,52:10,53:12,54:2,55:7,56:5,57:5,58:5,59:7,60:7,61:10,62:11,63:12,64:12,65:12,66:12}
LV={'하':2,'중':3,'상':4}
def lvl(m,d): return LV[d] if m['sec']=='유형' else (3 if m['sec']=='서술형' else 4)
def b64(p):
    im=Image.open(p).convert('RGB'); b=io.BytesIO(); im.save(b,'JPEG',quality=82); return base64.b64encode(b.getvalue()).decode()
def akind(t):
    if re.fullmatch(r'[①②③④⑤]',t): return 'choice',t
    if re.fullmatch(r'-?\d+',t): return 'number',t
    return 'image',None
cards=[]; rows=[]
for m in M:
    n=m['no']; d=D[str(n)]; t=PER.get(n) or BOOK2STD[m['btype']]
    k,at=akind(A[str(n)]['t'])
    rows.append(dict(no=n,sec=m['sec'],d=d,lv=lvl(m,d),t=t,k=k,a=at))
    tags=f'<span class="sec s{m["sec"]}">{m["sec"]}</span><span class="lv">레벨 {lvl(m,d)}</span>'+(f'<span class="tg">{d}</span>' if d else '')
    bt=f' <span class="muted">(책 유형 {m["btype"]:02d})</span>' if m['btype'] else ''
    ans=f'자동채점: <b>{html.escape(at)}</b>' if at else '학생 자기채점'
    cards.append(f'<div class="card" data-s="{m["sec"]}"><div class="hd"><b>{n:03d}</b>{tags}</div><div class="ty">유형 {t:02d} · {STD[t]}{bt}</div><img src="data:image/jpeg;base64,{b64(f"out/q/{n:03d}.png")}"><div class="ans"><span>{ans}</span><img src="data:image/jpeg;base64,{b64(f"out/a/{n:03d}_a.png")}"></div></div>')
from collections import Counter
C=Counter(r['sec'] for r in rows)
page=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>풍산자 01단원 확인</title><style>
:root{{--bg:#f4f3ef;--line:#ddd}} body{{margin:0;background:var(--bg);font-family:system-ui,"Malgun Gothic",sans-serif;color:#222}}
header{{max-width:1500px;margin:auto;padding:20px 16px 6px}} h1{{font-size:21px;margin:0 0 8px}}
.sum{{display:flex;flex-wrap:wrap;gap:8px}} .sum div{{background:#fff;border:1px solid var(--line);border-radius:8px;padding:7px 12px;font-size:14px}}
.flt{{margin-top:10px}} .flt button{{border:1px solid var(--line);background:#fff;border-radius:16px;padding:6px 14px;margin-right:6px;cursor:pointer}} .flt button.on{{background:#222;color:#fff}}
main{{max-width:1500px;margin:auto;padding:10px 16px 40px;columns:3 420px;column-gap:14px}}
.card{{break-inside:avoid;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:14px}}
.hd{{display:flex;gap:6px;align-items:center;flex-wrap:wrap}} .sec,.lv,.tg{{font-size:12px;border-radius:10px;padding:2px 8px;border:1px solid var(--line)}}
.s유형{{background:#2f9a55;color:#fff;border:0}} .s서술형{{background:#e8643c;color:#fff;border:0}} .s고득점{{background:#3a78c8;color:#fff;border:0}} .lv{{background:#fff7d6}}
.ty{{font-size:13px;margin:6px 0}} .muted{{color:#888}} .card>img{{width:100%;border:1px solid #eee}}
.ans{{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;margin-top:6px}} .ans img{{max-height:34px;max-width:100%;border:1px dashed #ccc}}
</style></head><body><header><h1>풍산자 필수유형 공통수학1 · 01 다항식의 연산 (001~066)</h1>
<div class="sum"><div>전체 <b>{len(rows)}</b>문항</div><div>유형 {C["유형"]} · 서술형 {C["서술형"]} · 고득점 {C["고득점"]}</div><div>자동채점 {sum(r["k"]!="image" for r in rows)} (①~⑤ {sum(r["k"]=="choice" for r in rows)}, 숫자 {sum(r["k"]=="number" for r in rows)})</div><div>레벨(제안): 하 2 · 중 3 · 상 4 · 서술형 3 · 고득점 4</div></div>
<div class="flt"><button class="on" data-f="all">전체</button><button data-f="유형">유형</button><button data-f="서술형">서술형</button><button data-f="고득점">고득점</button></div></header><main>{"".join(cards)}</main>
<script>document.querySelectorAll('.flt button').forEach(b=>b.onclick=()=>{{document.querySelectorAll('.flt button').forEach(x=>x.classList.remove('on'));b.classList.add('on');const f=b.dataset.f;document.querySelectorAll('.card').forEach(c=>c.style.display=(f==='all'||c.dataset.s===f)?'':'none')}})</script></body></html>'''
open('풍산자_01단원_확인.html','w',encoding='utf8').write(page)
json.dump(rows,open('rows01.json','w'),ensure_ascii=False)
print(C, Counter(r['k'] for r in rows), Counter(r['lv'] for r in rows))
