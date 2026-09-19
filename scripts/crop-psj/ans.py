import pymupdf, re, json, numpy as np
from PIL import Image
s=pymupdf.open('sol.pdf'); ev=[]
def cols(pi,p):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    div=xs[0] if xs else 318
    return div
for pi,p in enumerate(s):
    div=cols(pi,p)
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines',[]):
            t=''.join(z['text'] for z in l['spans']).strip().lstrip('`'); bb=l['bbox']; col=int(bb[0]>div)
            if l['spans'] and 'Leferi' in l['spans'][0]['font'] and re.fullmatch(r'\d{3}',t): ev.append((pi,col,bb[1],'n',int(t),bb,None,div))
            elif t.startswith('정답_'):
                sp=[z for z in l['spans'] if z['text'].strip().strip('`_') and '정답' not in z['text']]
                ev.append((pi,col,bb[1],'a',t[3:].strip(),bb,sp[0]['bbox'][0] if sp else bb[0],div))
ev.sort(key=lambda e:(e[0],e[1],e[2]))
A={}; cur=None
for i,(pi,col,y,k,v,bb,ax,div) in enumerate(ev):
    if k=='n': cur=v; continue
    nxt=[e for e in ev[i+1:] if e[0]==pi and e[1]==col]
    ybot=min(nxt[0][2]-2, bb[3]+60) if nxt else bb[3]+60
    xr=(div-4) if col==0 else 600
    z=3.0; pm=s[pi].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=pymupdf.Rect(ax+0.3,bb[1]-3,xr,ybot))
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3]
    m=a.min(2)<200; ys=np.where(m.any(1))[0]; xs=np.where(m.any(0))[0]
    # keep the block of rows around the answer line (gaps > 14px separate blocks)
    blocks=[]; 
    for yy in ys:
        if blocks and yy-blocks[-1][1]<=14: blocks[-1][1]=yy
        else: blocks.append([yy,yy])
    cy=((bb[1]+bb[3])/2-(bb[1]-3))*z
    blk=min(blocks,key=lambda b_: 0 if b_[0]<=cy<=b_[1] else min(abs(cy-b_[0]),abs(cy-b_[1])))
    a=a[blk[0]:blk[1]+1]; m=a.min(2)<200; xs=np.where(m.any(0))[0]; a=a[:, xs[0]:xs[-1]+1]
    h,w=a.shape[:2]; H=max(35,h+10); Wd=max(458,w+12)
    can=np.full((H,Wd,3),255,np.uint8); can[(H-h)//2:(H-h)//2+h,4:4+w]=a
    Image.fromarray(can).save(f'out/a/{cur:03d}_a.png')
    A[cur]=dict(t=v,h=h)
print('answers',len(A),'missing',[n for n in range(1,927) if n not in A])
json.dump(A,open('a_meta.json','w'),ensure_ascii=False)
