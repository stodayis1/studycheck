import json, base64, io, html
from PIL import Image
R=[r for r in json.load(open('rows.json')) if r['l'].startswith('01-')]
STD={1:'다항식의 덧셈과 뺄셈',2:'전개식에서 계수 구하기',3:'곱셈 공식을 이용한 전개',4:'공통부분이 있는 전개',5:'x²+y², x³+y³의 값',6:'x²+1/x², x³+1/x³의 값',7:'a²+b²+c², a³+b³+c³의 값',8:'곱셈 공식을 이용한 수의 계산',9:'나눗셈: 몫과 나머지',10:'나눗셈: A=BQ+R',11:'몫과 나머지의 변형',12:'도형에의 활용'}
def b64(p):
    im=Image.open(p).convert('RGB'); b=io.BytesIO(); im.save(b,'JPEG',quality=82); return base64.b64encode(b.getvalue()).decode()
cards=[]
for r in R:
    t=int(r['c'][-2:]); tags=''.join(f'<span class="tg">{html.escape(x)}</span>' for x in r['tags'])
    ans=f'자동채점: <b>{html.escape(r["a"])}</b>' if r['a'] else '학생 자기채점'
    cards.append(f'<div class="card" data-s="{r["p"]}"><div class="hd"><b>{r["l"]}</b><span class="sec s{r["p"]}">{"기본을 다지는 유형" if r["p"]=="기본" else "실력을 높이는 연습"}</span>{tags}</div><div class="ty">유형 {t:02d} · {STD[t]}</div><img src="data:image/jpeg;base64,{b64(f"out/q/{r["l"]}.png")}"><div class="ans"><span>{ans}</span><img src="data:image/jpeg;base64,{b64(f"out/a/{r["l"]}_a.png")}"></div></div>')
nb=sum(r['p']=='기본' for r in R)
page=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>풍산자 라이트 01단원</title><style>
body{{margin:0;background:#f4f3ef;font-family:system-ui,"Malgun Gothic",sans-serif;color:#222}} header{{max-width:1500px;margin:auto;padding:20px 16px 6px}} h1{{font-size:21px;margin:0 0 8px}}
.sum{{display:flex;flex-wrap:wrap;gap:8px}} .sum div{{background:#fff;border:1px solid #ddd;border-radius:8px;padding:7px 12px;font-size:14px}}
.flt{{margin-top:10px}} .flt button{{border:1px solid #ddd;background:#fff;border-radius:16px;padding:6px 14px;margin-right:6px;cursor:pointer}} .flt button.on{{background:#222;color:#fff}}
main{{max-width:1500px;margin:auto;padding:10px 16px 40px;columns:3 420px;column-gap:14px}} .card{{break-inside:avoid;background:#fff;border:1px solid #ddd;border-radius:10px;padding:10px;margin-bottom:14px}}
.hd{{display:flex;gap:6px;align-items:center;flex-wrap:wrap}} .sec,.tg{{font-size:12px;border-radius:10px;padding:2px 8px;border:1px solid #ddd}} .s기본{{background:#4fb848;color:#fff;border:0}} .s연습{{background:#7f74b5;color:#fff;border:0}}
.ty{{font-size:13px;margin:6px 0}} .card>img{{width:100%;border:1px solid #eee}} .ans{{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;margin-top:6px}} .ans img{{max-height:40px;max-width:100%;border:1px dashed #ccc}}
</style></head><body><header><h1>풍산자 라이트유형 공통수학1 · 01 다항식의 연산</h1><div class="sum"><div>전체 <b>{len(R)}</b>문항</div><div>기본 유형 {nb} · 연습 문제 {len(R)-nb}</div><div>자동채점 {sum(1 for r in R if r["a"])}</div></div>
<div class="flt"><button class="on" data-f="all">전체</button><button data-f="기본">기본 유형</button><button data-f="연습">연습 문제</button></div></header><main>{"".join(cards)}</main>
<script>document.querySelectorAll('.flt button').forEach(b=>b.onclick=()=>{{document.querySelectorAll('.flt button').forEach(x=>x.classList.remove('on'));b.classList.add('on');const f=b.dataset.f;document.querySelectorAll('.card').forEach(c=>c.style.display=(f==='all'||c.dataset.s===f)?'':'none')}})</script></body></html>'''
open('풍산자라이트_01단원_확인.html','w',encoding='utf8').write(page); print(len(R))
