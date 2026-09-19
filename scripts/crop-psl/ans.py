import pymupdf, re, json, numpy as np
from PIL import Image
s=pymupdf.open('sol.pdf'); ev=[]
SPANS=[[z['bbox'] for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if z['text'].strip() and z['text'].strip()!="'"] for p in s]
DRAW=[[tuple(d['rect']) for d in p.get_drawings()] for p in s]
for pi,p in enumerate(s):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    div=xs[0] if xs else 318
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines',[]):
            sp=[z for z in l['spans'] if z['text'].strip()] or l['spans']; t=''.join(z['text'] for z in sp).strip(); bb=l['bbox']; col=int(bb[0]>div)
            if sp and sp[0]['font']=='Jalnan' and re.fullmatch(r'\d{2,3}',t): ev.append(dict(pg=pi,col=col,y=bb[1],k='n',t=t))
            elif sp and sp[0]['text'].strip()=='답' and sp[0]['size']<7.5:
                rest=[z for z in sp[1:] if z['text'].strip()]
                core=[z['bbox'] for z in sp if z['text'].strip() and z['text'].strip()!="'"]
                bb=(bb[0],min(c[1] for c in core),bb[2],max(c[3] for c in core))
                ev.append(dict(pg=pi,col=col,y=bb[1],k='a',t=''.join(z['text'] for z in sp[1:]).strip(),bb=bb,ax=rest[0]['bbox'][0] if rest else bb[2],div=div))
ev.sort(key=lambda e:(e['pg'],e['col'],e['y']))
A={}; cur=None; ch=1; inex=False
for i,e in enumerate(ev):
    if e['k']=='n':
        ex=len(e['t'])==2
        if not ex and inex: ch+=1
        inex=ex; no=int(e['t']); cur=f"{ch:02d}-S{no:02d}" if ex else f"{ch:02d}-{no:03d}"; continue
    bb=e['bb']; z=3.0
    # group text spans around the answer line: to the right of the '답' mark, touching vertically (<4pt)
    SP=SPANS[e['pg']]
    xl=e['ax']-1; xr=(e['div']-4) if e['col']==0 else 600
    box=[e['ax'],bb[1],bb[2],bb[3]]
    _n=[f for f in ev[i+1:] if f['pg']==e['pg'] and f['col']==e['col']]
    YB=min(_n[0]['y']-1 if _n else 9999, 792)
    def grow(box):
        ch_=False
        for d_ in DRAW[e['pg']]:   # brackets / braces / fraction bars that overlap the current box
            if d_[0]>=xl and d_[2]<=xr+2 and d_[3]>box[1]+1 and d_[1]<box[3]-1 and d_[1]>=top-1 and (d_[3]-d_[1])<60 and (d_[2]-d_[0])<260:
                nb=[min(box[0],d_[0]),min(box[1],d_[1]),max(box[2],d_[2]),max(box[3],d_[3])]
                if nb!=box: box[:]=nb; ch_=True
        for r in SP:
            if r[0]<xl or r[2]>xr+2: continue
            overlap = r[3]>box[1]+1 and r[1]<box[3]-1 and r[1]>=top-1
            below   = box[3]-1<=r[1]<=box[3]+7 and r[3]<=YB
            if overlap or below:
                nb=[min(box[0],r[0]),min(box[1],r[1]),max(box[2],r[2]),max(box[3],r[3])]
                if nb!=box: box[:]=nb; ch_=True
        return ch_
    # top is fixed after brackets/fraction bars that cross the answer line itself; only numerators/brackets may reach above
    top=bb[1]
    for d_ in DRAW[e['pg']]:
        if d_[0]>=xl and d_[2]<=xr+2 and d_[3]>bb[1]+1 and d_[1]<bb[3]-1 and (d_[3]-d_[1])<60 and (d_[2]-d_[0])<260: top=min(top,d_[1])
    for r in SP:   # numerators etc. overlapping the answer line itself
        if r[0]>=xl and r[2]<=xr+2 and r[3]>bb[1]+1.5 and r[1]<bb[3]-1: top=min(top,r[1])
    box[1]=top
    for _ in range(12):
        if not grow(box): break
        box[1]=max(box[1],top) if False else box[1]
    pm=s[e['pg']].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=pymupdf.Rect(box[0]-1,box[1]-1.5,box[2]+1,box[3]+1.5))
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3]
    m=a.min(2)<200; ys=np.where(m.any(1))[0]; xs=np.where(m.any(0))[0]
    a=a[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
    h,w=a.shape[:2]; H=max(35,h+10); Wd=max(458,w+12)
    can=np.full((H,Wd,3),255,np.uint8); can[(H-h)//2:(H-h)//2+h,4:4+w]=a
    Image.fromarray(can).save(f'out/a/{cur}_a.png')
    if cur in A: print('dup',cur)
    A[cur]=dict(t=e['t'],h=h)
Q=[o['l'] for o in json.load(open('q_meta.json'))]
print('answers',len(A),'missing',[x for x in Q if x not in A],'extra',[x for x in A if x not in Q])
json.dump(A,open('a_meta.json','w'),ensure_ascii=False)
