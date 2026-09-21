import json, os, numpy as np
from PIL import Image
from det import page
OUT='out/q'; os.makedirs(OUT,exist_ok=True)
c=json.load(open('nums_ok.json',encoding='utf8'))
for d in c: d['half']=0 if d['x0']<780 else 1
PAGE_W=1644; TOP=150; BOT=2245
bypc={}
for d in c: bypc.setdefault((d['pg'],d['half']),[]).append(d)
rows_all=[]
for pg in sorted({d['pg'] for d in c}):
    ds=[d for d in c if d['pg']==pg]
    xs=sorted({d['x0'] for d in ds})
    cl=[]
    for x in xs:
        if cl and x-cl[-1][-1]<70: cl[-1].append(x)
        else: cl.append([x])
    starts=[min(z) for z in cl]
    for d in ds:
        i=max(k for k,s0 in enumerate(starts) if d['x0']>=s0-8)
        d['col']=i
        d['cx0']=max(36, starts[i]-12)
        d['cx1']=(starts[i+1]-16) if i+1<len(starts) else PAGE_W-36
    for d in ds:
        same=[e for e in ds if e['col']==d['col'] and e['y0']>d['y0']+25]
        d['cy0']=max(TOP, d['y0']-8)
        d['cy1']=(min(e['y0'] for e in same)-12) if same else BOT
    rows_all+=sorted(ds,key=lambda d:(d['col'],d['y0']))
json.dump(rows_all,open('nums_col.json','w'))
def cut_at_gap(g, x0, x1, ytop, ybot, gap=58):
    """문항 아래로 내려가다가 빈 줄이 gap 이상 이어지면 거기서 끊는다"""
    band=(g[ytop:ybot, x0:x1]<150)
    rows=band.sum(1)
    W=x1-x0
    run=0; start=None
    for i,v in enumerate(rows):
        if i<55: continue                      # 문항 첫 줄은 건너뛴다
        if v<=0.004*W:
            if run==0: start=i
            run+=1
            if run>=gap: return ytop+start
        else: run=0
    return ybot
def trim(a,pad=8):
    ink=(a<150); ys=np.where(ink.any(1))[0]
    if not len(ys): return None
    return a[max(0,ys[0]-pad):ys[-1]+pad+1]
cache={}; made=0; bad=[]
for d in rows_all:
    if d['pg'] not in cache: cache.clear(); cache[d['pg']]=page(d['pg'])
    g=cache[d['pg']]
    cy1=min(d['cy1'], 2180)
    cy1=cut_at_gap(g, d['cx0'], d['cx1'], d['cy0'], cy1)
    a=g[d['cy0']:cy1, d['cx0']:d['cx1']].astype(np.uint8)
    a=trim(a)
    if a is None or a.shape[0]<25: bad.append(d['no']); continue
    Image.fromarray(a).save(f"{OUT}/{d['no']:04d}.png"); made+=1
print('자른 문항',made,'| 실패',len(bad),bad[:8])
