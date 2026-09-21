import pymupdf, re, json, os, numpy as np
from PIL import Image
s=pymupdf.open('sol.pdf'); q=pymupdf.open('q.pdf')
rows=json.load(open('qmeta.json',encoding='utf8'))
ev=json.load(open('ev.json',encoding='utf8'))
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
SP=[[sp for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for sp in l['spans'] if sp['text'].strip()] for p in s]
# 해설 PDF의 대단원 경계: '개념편' 쪽 흐름과 같은 순서 → 문항 번호(NN-k)를 차례로 읽어 단원을 따라간다
nums=[]
for i,sp in enumerate(SP):
    for z in sp:
        t=z['text'].strip()
        if z['font'].startswith('DIN-Regular') and re.fullmatch(r'\d{2}-',t):
            sub=[w for w in sp if w['font'].startswith('DIN-Black') and abs(w['bbox'][1]-z['bbox'][1])<5 and -3<=w['bbox'][0]-z['bbox'][2]<10]
            if sub and sub[0]['text'].strip().isdigit():
                nums.append(dict(pg=i,ex=int(t[:2]),sub=int(sub[0]['text'].strip()),x0=z['bbox'][0],y0=z['bbox'][1],y1=z['bbox'][3]))
nums.sort(key=lambda n:(n['pg'], 0 if n['x0']<290 else 1, n['y0']))
print('해설 문항 번호',len(nums))
# 개념편 순서(단원,예제,유제)와 차례로 맞춘다
want=[(r['ch'],r['ex'],r['sub']) for r in rows if r['k']=='pr']
got=[(n['ex'],n['sub']) for n in nums]
print('개념편 유제',len(want),'해설',len(got))
print('앞 10개', got[:10], want[:5])
json.dump(nums,open('anum.json','w'))

# ── 유제 정답 이미지 ─────────────────────────────────────────
import numpy as np
from PIL import Image
COLS=[(46,306),(313,548)]
def coli(x): return 0 if x<300 else 1
def trim(a,pad=5):
    """위아래 여백만 자른다 (가로는 그대로 둬야 글자 크기가 문항마다 같다)"""
    ink=(a.min(2)<235); ys=np.where(ink.any(1))[0]
    if not len(ys): return None
    return a[max(0,ys[0]-pad):ys[-1]+pad+1]
pr=[r for r in rows if r['k']=='pr']
assert len(pr)==len(nums)
for r,n in zip(pr,nums):
    pg=n['pg']; ci=coli(n['x0']); x0,x1=COLS[ci]
    later=[z for z in SP[pg] if z['bbox'][1]>n['y0']+4 and coli(z['bbox'][0])==ci]
    stop=[]
    nx=[m for m in nums if m['pg']==pg and coli(m['x0'])==ci and m['y0']>n['y0']+4]
    if nx: stop.append(nx[0]['y0']-4)
    # 답 글꼴: YDVYMjO14·NPBIE·NPBUN / 풀이 글꼴: YDVYMjO12·13·NPIE·NPYP·YDVYGO
    sol=[z for z in later if z['font'].startswith(('NPIE','NPYP','YDVYGO','YDVYMjO12','YDVYMjO13'))]
    if sol: stop.append(min(z['bbox'][1] for z in sol)-3)
    bot=min(stop) if stop else 752
    z_=680/(x1-x0)
    pm=s[pg].get_pixmap(matrix=pymupdf.Matrix(z_,z_),clip=pymupdf.Rect(x0,n['y0']-4,x1,bot))
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
    # 번호 지우기
    a[:, :int((n['x0']+22-x0)*z_)]=255
    a=trim(a)
    if a is None: continue
    Image.fromarray(a).save(f"{OUT}/{r['name']}.png")
print('유제 정답',len(pr))

# ── 정답 글자·크기 기록 (자동채점 판정용) ─────────────────────
meta={}
for r,n in zip(pr,nums):
    pg=n['pg']; ci=coli(n['x0']); x0,x1=COLS[ci]
    nx=[m for m in nums if m['pg']==pg and coli(m['x0'])==ci and m['y0']>n['y0']+4]
    later=[z for z in SP[pg] if z['bbox'][1]>n['y0']+4 and coli(z['bbox'][0])==ci]
    sol=[z for z in later if z['font'].startswith(('NPIE','NPYP','YDVYGO','YDVYMjO12','YDVYMjO13'))]
    stop=[]
    if nx: stop.append(nx[0]['y0']-4)
    if sol: stop.append(min(z['bbox'][1] for z in sol)-3)
    bot=min(stop) if stop else 752
    body=[z for z in SP[pg] if n['y0']-4<=z['bbox'][1]<bot and coli(z['bbox'][0])==ci and z['bbox'][0]>n['x0']+15]
    body.sort(key=lambda z:(round(z['bbox'][1]),z['bbox'][0]))
    txt=''.join(z['text'] for z in body).strip()
    try:
        from PIL import Image as I
        h=I.open(f"{OUT}/{r['name']}.png").height
    except Exception: h=999
    meta[r['name']]=dict(t=txt,f=sorted({z['font'] for z in body}),h=h)
json.dump(meta,open('ameta.json','w'),ensure_ascii=False)
print('정답 글자 기록',len(meta))
