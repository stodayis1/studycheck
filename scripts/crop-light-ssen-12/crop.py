import json, os, numpy as np
from PIL import Image
from qdet import page
rows=json.load(open('qnums_ok.json',encoding='utf8'))
brk=json.load(open('qbrk.json',encoding='utf8'))
OUT='out/q'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
TOP=130; BOT=2210
def cut_at_gap(g,x0,x1,ytop,ybot,gap=62):
    band=(g[ytop:ybot, x0:x1]<170); rr=band.sum(1); W=x1-x0; run=0; start=None
    for i,v in enumerate(rr):
        if i<60: continue
        if v<=0.004*W:
            if run==0: start=i
            run+=1
            if run>=gap: return ytop+start
        else: run=0
    return ybot
def trim(a,pad=8):
    ink=(a<175); ys=np.where(ink.any(1))[0]
    return a[max(0,ys[0]-pad):ys[-1]+pad+1] if len(ys) else None
byp={}
for r in rows: byp.setdefault(r['pg'],[]).append(r)
brp={}
for b in brk: brp.setdefault(b['pg'],[]).append(b)
made=0; withinst=0
for pg,ds in sorted(byp.items()):
    im=page(pg); W=im.shape[1]; g=im.mean(2)
    xs=sorted({d['x0'] for d in ds})
    cl=[]
    for x in xs:
        if cl and x-cl[-1][-1]<70: cl[-1].append(x)
        else: cl.append([x])
    starts=[min(z) for z in cl]
    for d in ds:
        i=max(k for k,s0 in enumerate(starts) if d['x0']>=s0-8)
        d['cx0']=max(30, starts[i]-14)
        d['cx1']=(starts[i+1]-18) if i+1<len(starts) else W-34
        d['ci']=i
    for d in ds:
        same=[e for e in ds if e['ci']==d['ci'] and e['y0']>d['y0']+25]
        cy0=max(TOP, d['y0']-10)
        cy1=min((min(e['y0'] for e in same)-12) if same else BOT, BOT)
        cy1=cut_at_gap(g, d['cx0'], d['cx1'], cy0, cy1)
        a=g[cy0:cy1, d['cx0']:d['cx1']].astype(np.uint8)
        a=trim(a)
        if a is None or a.shape[0]<28: continue
        # 같은 칸에서 바로 위에 있는 묶음 지시문 붙이기
        cands=[b for b in brp.get(pg,[]) if d['cx0']-20<=b['x0']<=d['cx1'] and b['y0']<d['y0']-20]
        if cands:
            bb=max(cands, key=lambda b:b['y0'])
            # 지시문과 이 문항 사이에 다른 지시문이 없어야 한다
            nxt=[e for e in ds if e['ci']==d['ci'] and bb['y0']<e['y0']<d['y0']]
            first=min([e['y0'] for e in ds if e['ci']==d['ci'] and e['y0']>bb['y0']]+[d['y0']])
            hs=[e for e in ds if (e['x0']<500)==(d['x0']<500)]       # 같은 쪽 절반
            ix0=max(30, min(e['cx0'] for e in hs))
            ix1=(W-34) if d['x0']>=500 else min(W//2+40, max(e['cx1'] for e in hs))
            ins=g[max(TOP,bb['y0']-12): min(first-8, bb['y0']+330), ix0:ix1].astype(np.uint8)
            ins=trim(ins,4)
            if ins is not None and 20<ins.shape[0]<360 and len(nxt)<=8:
                wmax=max(ins.shape[1], a.shape[1])
                def padw(z):
                    if z.shape[1]==wmax: return z
                    return np.hstack([z, np.full((z.shape[0], wmax-z.shape[1]),255,np.uint8)])
                a=np.vstack([padw(ins), np.full((10,wmax),255,np.uint8), padw(a)]); withinst+=1
        Image.fromarray(a).save(f"{OUT}/{d['no']:04d}.png"); made+=1
print('자른 문항',made,'| 지시문 붙임',withinst)
