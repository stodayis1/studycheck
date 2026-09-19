import pymupdf, re, json, numpy as np
from PIL import Image
s=pymupdf.open('sol.pdf'); ev=[]
SPANS=[[z['bbox'] for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if z['text'].strip() and z['text'].strip()!="'"] for p in s]
RAD=[[z['bbox'] for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if z['text'].strip()=="'"] for p in s]
DRAW=[[tuple(d['rect']) for d in p.get_drawings()] for p in s]
NUMPOS=[]
for pi,p in enumerate(s):
    NUMPOS.append([(z['bbox'][0],(z['bbox'][1]+z['bbox'][3])/2) for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if 'MyriadPro-Bold' in z['font'] and z['size']>11.5 and z['text'].strip()[:2]=='00' or ('MyriadPro-Bold' in z['font'] and z['size']>11.5 and z['text'].strip()[:1] in '01' and len(z['text'].strip())>=2)])
PSP=[[z for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if z['text'].strip()] for p in s]
for pi,p in enumerate(s):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    div=xs[0] if xs else 312
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines',[]):
            sp=[z for z in l['spans'] if z['text'].strip()]
            hoy=[z for z in sp if 'MyriadPro-Bold' in z['font'] and z['size']>11.5]
            cl=[]
            for z in sorted(hoy,key=lambda z:z['bbox'][0]):   # several numbers can share one line
                if cl and z['bbox'][0]-cl[-1][-1]['bbox'][2]<=6: cl[-1].append(z)
                else: cl.append([z])
            for c in cl:
                t=''.join(z['text'].strip() for z in c)
                if re.fullmatch(r'\d{4}',t): ev.append(dict(pg=pi,col=int(c[0]['bbox'][0]>div),y=(c[0]['bbox'][1]+c[0]['bbox'][3])/2-8,cy=(c[0]['bbox'][1]+c[0]['bbox'][3])/2,x=c[0]['bbox'][0],k='n',t=int(t)))
            for j,z in enumerate(sp):
                if z['text'].strip()=='답' and z['size']<7.5:
                    gy=(z['bbox'][1]+z['bbox'][3])/2
                    nx=[x for x,y in NUMPOS[pi] if x>z['bbox'][0]+5 and abs(y-gy)<7]
                    xlim=min(nx) if nx else 9999
                    cand=sorted([r for r in PSP[pi] if abs((r['bbox'][1]+r['bbox'][3])/2-gy)<6 and r['bbox'][0]>z['bbox'][0] and r['bbox'][2]<=xlim and r['text'].strip()!='답'],key=lambda r:r['bbox'][0])
                    rest=[]; lastx=z['bbox'][2]
                    for r in cand:
                        if r['bbox'][0]-lastx>(80 if rest and (rest[0]['text'].strip() in ('(','{','[') or 'paren' in rest[0]['font']) else 30): break
                        rest.append(r); lastx=max(lastx,r['bbox'][2])
                    core=[r['bbox'] for r in rest if r['text'].strip()!="'"] or [z['bbox']]
                    tallbr=bool(rest) and (rest[0]['text'].strip() in ('(','{','[') or 'paren' in rest[0]['font'] or any('paren' in r['font'] for r in rest))
                    bb=(z['bbox'][0],min(c[1] for c in core),max(c[2] for c in core),max(c[3] for c in core))
                    full=''.join(r['text'] for r in rest).strip()
                    ev.append(dict(pg=pi,col=int(z['bbox'][0]>div),y=(z['bbox'][1]+z['bbox'][3])/2,k='a',full=full,t=''.join(r['text'] for r in rest).strip(),bb=bb,ax=rest[0]['bbox'][0] if rest else z['bbox'][2],div=div,xlim=xlim,gx=z['bbox'][0],tallbr=tallbr,fonts=sorted({r['font'] for r in rest})))
ev.sort(key=lambda e:(e['pg'],e['col'],e['y']))
A={}; cur=None; MB=[]
for i,e in enumerate(ev):
    if e['k']=='n': cur=e['t']; continue
    same=[f for f in ev if f['k']=='n' and f['pg']==e['pg'] and f['col']==e['col'] and abs(f['cy']-e['y'])<6 and f['x']<e['gx']]
    if same: cur=max(same,key=lambda f:f['x'])['t']
    if cur in A: continue
    bb=e['bb']; z=3.0; xl=e['ax']-1; xr=min((e['div']-4) if e['col']==0 else 578, e['xlim']-3)
    SP=SPANS[e['pg']]+RAD[e['pg']]; DR=DRAW[e['pg']]
    box=[e['ax'],bb[1],bb[2],bb[3]]
    xmax=xr if e['tallbr'] else bb[2]+2            # matrices / systems spread to the right of the bracket
    for _ in range(8):
        nb=list(box)
        for r in SP:
            if r[0]>=box[0]-2 and r[2]<=xmax and ((r[3]-r[1])<22 or e['tallbr']) and r[3]>=box[1]-3 and r[1]<=box[3]+3:
                nb=[min(nb[0],r[0]),min(nb[1],r[1]),max(nb[2],r[2]),max(nb[3],r[3])]
        for d_ in DR:
            w_=d_[2]-d_[0]; h_=d_[3]-d_[1]
            if d_[0]>=box[0]-2 and d_[2]<=xmax and ((h_<2 and w_<120) or (w_<8 and h_<40)) and d_[3]>box[1]-2 and d_[1]<box[3]+2:
                nb=[min(nb[0],d_[0]),min(nb[1],d_[1]),max(nb[2],d_[2]),max(nb[3],d_[3])]
        if nb==box: break
        box=nb
    lim=(20 if e['tallbr'] else 14); cyp=e['y']; box[3]=min(box[3],cyp+lim); box[1]=max(box[1],cyp-lim)
    pm=s[e['pg']].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=pymupdf.Rect(box[0]-1,box[1]-1.5,min(box[2]+1,xr),box[3]+1.5))
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
    a[(a.min(2)>205)&((a.max(2).astype(int)-a.min(2))<40)]=255      # watermark → white
    g=a.astype(int); a[(g[...,1]-g[...,0]>40)&(g[...,1]-g[...,2]>20)]=255   # green '답' badge → white
    m=a.min(2)<200; ys=np.where(m.any(1))[0]
    if not len(ys): ys=np.array([0,a.shape[0]-1])
    blocks=[]
    for yy in ys:
        if blocks and yy-blocks[-1][1]<=7: blocks[-1][1]=yy
        else: blocks.append([yy,yy])
    cy=((e['y'])-(box[1]-1.5))*z
    if e['tallbr']:   # matrix rows / system lines sit a bit apart - merge with a wider gap
        blocks=[]
        for yy in ys:
            if blocks and yy-blocks[-1][1]<=16: blocks[-1][1]=yy
            else: blocks.append([yy,yy])
    keep=[bl for bl in blocks if bl[0]-3<=cy<=bl[1]+3] or blocks
    a=a[min(k[0] for k in keep):max(k[1] for k in keep)+1]
    m=a.min(2)<200; xs=np.where(m.any(0))[0]
    if len(xs): a=a[:, xs[0]:xs[-1]+1]
    h,w=a.shape[:2]; H=max(35,h+10); Wd=max(458,w+12)
    can=np.full((H,Wd,3),255,np.uint8); can[(H-h)//2:(H-h)//2+h,4:4+w]=a
    Image.fromarray(can).save(f'out/a/{cur:04d}_a.png'); A[cur]=dict(t=e['t'],full=e['full'],h=h,multi=bool(e['tallbr']),fonts=e['fonts'])
Q=[o['no'] for o in json.load(open('q_meta.json'))]
print('answers',len(A),'missing',[x for x in Q if x not in A][:30],'extra',[x for x in A if x not in Q][:20])
json.dump(A,open('a_meta.json','w'),ensure_ascii=False)
print([m for m in MB if m[1]>1])
