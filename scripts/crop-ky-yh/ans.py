import pymupdf, re, json, os, numpy as np
from PIL import Image
s=pymupdf.open('sol.pdf')
rows=json.load(open('qmeta.json',encoding='utf8'))
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
SP=[[z for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if z['text'].strip()] for p in s]
# 빠른 정답 표: DIN-Bold 9.3pt 초록 번호 (자세한 해설 번호는 10.1pt)
ents=[]
for i in range(105,176):
    seen=set()
    for z in SP[i]:
        if z['font'].startswith('DIN-Bold') and z['color']==0x36734d and 8.8<z['size']<9.8 and re.fullmatch(r'\d{1,3}',z['text'].strip()):
            k=(round(z['bbox'][0]),round(z['bbox'][1]))
            if k in seen: continue
            seen.add(k)
            ents.append(dict(pg=i,no=int(z['text'].strip()),x0=z['bbox'][0],x1=z['bbox'][2],y0=z['bbox'][1],y1=z['bbox'][3]))
# 같은 줄 묶기: 행렬 답처럼 두 줄짜리가 섞이면 y가 조금씩 어긋난다 (9pt 안이면 같은 줄)
ents.sort(key=lambda e:(e['pg'],e['y0'],e['x0']))
for pg in {e['pg'] for e in ents}:
    cur=[e for e in ents if e['pg']==pg]
    row=0; base=None
    for e in cur:
        if base is None or e['y0']-base>9: row+=1; base=e['y0']
        e['row']=row
ents.sort(key=lambda e:(e['pg'],e['row'],e['x0']))
# 번호가 1로 돌아갈 때마다 새 중단원
sec=0; prev=None
for e in ents:
    if prev is None or e['no']<=prev: sec+=1
    e['sec']=sec; prev=e['no']
sec=0; prev=None
for r in rows:
    if prev is None or r['booknoo']<=prev: sec+=1
    r['sec']=sec; prev=r['booknoo']
import collections
cq=collections.Counter(r['sec'] for r in rows); ca=collections.Counter(e['sec'] for e in ents)
print('중단원 수 — 문제',len(cq),'정답',len(ca))
diff=[(k,cq[k],ca.get(k)) for k in sorted(cq) if cq[k]!=ca.get(k)]
print('개수 다른 중단원',diff)
AN={(e['sec'],e['no']):e for e in ents}
print('빠른정답 항목',len(ents),'| 문항',len(rows))
RIGHT=283
def trim(a,pad=4):
    ink=(a.min(2)<235); ys=np.where(ink.any(1))[0]; xs=np.where(ink.any(0))[0]
    if not len(ys): return None
    return a[max(0,ys[0]-pad):ys[-1]+pad+1, :max(4,xs[-1]+pad+1)]
meta={}
for r in rows:
    e=AN.get((r['sec'],r['booknoo']))
    if e is None: print('정답 못 찾음',r['name']); continue
    pg=e['pg']
    same=[w for w in ents if w['pg']==pg and w['row']==e['row'] and w['x0']>e['x0']+5]
    x1=min([w['x0']-3 for w in same]+[283.0 if e['x0']<290 else 533.0])
    x0=e['x1']+1; y0=e['y0']-3.5; y1=e['y0']+13
    z=420/(x1-x0)
    pm=s[pg].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=pymupdf.Rect(x0,y0,x1,y1))
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
    a=trim(a)
    if a is None: print('빈 정답',r['name']); continue
    Image.fromarray(a).save(f"{OUT}/{r['name']}.png")
    body=[z_ for z_ in SP[pg] if y0<=z_['bbox'][1]<y1 and x0-2<=z_['bbox'][0]<x1]
    body.sort(key=lambda z_:z_['bbox'][0])
    # 답 칸 안에 그려진 도형(√ 기호 등)이 있으면 글자만으로는 답을 알 수 없다
    box=pymupdf.Rect(x0,y0,x1,y1)
    draw=sum(1 for d in s[pg].get_drawings() if box.intersects(d['rect']) and d['rect'].width<60)
    meta[r['name']]=dict(t=''.join(z_['text'] for z_ in body).strip(), f=sorted({z_['font'] for z_ in body}),
                         draw=draw, booknoo=r['booknoo'], solno=e['no'])
json.dump(meta,open('ameta.json','w'),ensure_ascii=False)
bad=[k for k,v in meta.items() if v['booknoo']!=v['solno']]
print('정답 이미지',len(meta),'| 번호 안 맞는 것',len(bad),bad[:5])
