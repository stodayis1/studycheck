import pymupdf, re, json, numpy as np
from PIL import Image
s=pymupdf.open('quick.pdf'); ev=[]
SPANS=[[z['bbox'] for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if z['text'].strip() and z['text'].strip()!="'"] for p in s]
RAD=[[z['bbox'] for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if z['text'].strip()=="'"] for p in s]
DRAW=[[tuple(d['rect']) for d in p.get_drawings()] for p in s]
for pi,p in enumerate(s):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    div=xs[0] if xs else 312
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines',[]):
            sp=[z for z in l['spans'] if z['text'].strip()]
            hoy=[z for z in sp if 'Hoyoyo' in z['font'] and z['size']>12]
            t=''.join(z['text'].strip() for z in hoy)
            if hoy and re.fullmatch(r'\d{4}',t): ev.append(dict(pg=pi,col=int(hoy[0]['bbox'][0]>div),y=(hoy[0]['bbox'][1]+hoy[0]['bbox'][3])/2-8,k='n',t=int(t)))
            for j,z in enumerate(sp):
                if z['text'].strip()=='답' and z['size']<7.5:
                    gy=(z['bbox'][1]+z['bbox'][3])/2
                    rest=[r for r in sp[j+1:] if abs((r['bbox'][1]+r['bbox'][3])/2-gy)<5 and r['bbox'][0]>=z['bbox'][0]]
                    core=[r['bbox'] for r in rest if r['text'].strip()!="'"] or [z['bbox']]
                    bb=(z['bbox'][0],min(c[1] for c in core),max(c[2] for c in core),max(c[3] for c in core))
                    full=''.join(r['text'] for r in sp[j+1:]).strip()
                    ev.append(dict(pg=pi,col=int(z['bbox'][0]>div),y=(z['bbox'][1]+z['bbox'][3])/2,k='a',full=full,t=''.join(r['text'] for r in rest).strip(),bb=bb,ax=rest[0]['bbox'][0] if rest else z['bbox'][2],div=div))
ev.sort(key=lambda e:(e['pg'],e['col'],e['y']))
A={}; cur=None; MB=[]
for i,e in enumerate(ev):
    if e['k']=='n': cur=e['t']; continue
    if cur in A: continue
    bb=e['bb']; z=3.0; xl=e['ax']-1; xr=(e['div']-4) if e['col']==0 else 600
    _n=[f for f in ev[i+1:] if f['pg']==e['pg'] and f['col']==e['col']]
    YB=min(_n[0]['y']-1 if _n else 9999, 800)
    SP=SPANS[e['pg']]; DR=DRAW[e['pg']]
    bands=[(bb[1],bb[3])]
    while True:   # continuation lines of a multi-line answer start at the answer's x
        lb=bands[-1][1]
        c=[r for r in SP if abs(r[0]-e['ax'])<3 and lb-1<=r[1]<=lb+4 and r[3]<=YB]
        break
        bands.append((min(r[1] for r in c),max(r[3] for r in c)))
    MB.append((cur,len(bands),e['t'][:30]))
    inb=lambda y0,y1: any(y1>b0+1.5 and y0<b1-1.5 for b0,b1 in bands)
    box=[e['ax'],bb[1],bb[2],bands[-1][1]]
    for r in SP:
        if r[0]>=xl and r[2]<=xr+2 and inb(r[1],r[3]) and (r[3]-r[1])<30:
            box=[min(box[0],r[0]),min(box[1],r[1]),max(box[2],r[2]),max(box[3],r[3])]
    for d_ in DR:
        if d_[0]>=xl and d_[2]<=xr+2 and inb(d_[1],d_[3]) and (d_[3]-d_[1])<40 and (d_[2]-d_[0])<260:
            box=[min(box[0],d_[0]),min(box[1],d_[1]),max(box[2],d_[2]),max(box[3],d_[3])]
    # fraction bars pulled the box up/down: take numerators/denominators and radical signs inside that range
    for r in SP+RAD[e['pg']]:
        if r[0]>=box[0]-6 and r[2]<=box[2]+2 and r[1]>=box[1]-1 and r[3]<=box[3]+1:
            box=[min(box[0],r[0]),box[1],max(box[2],r[2]),box[3]]
    for d_ in DR:
        if d_[0]>=box[0]-1 and d_[2]<=box[2]+1 and d_[3]>box[1]+1 and d_[1]<box[3]-1 and (d_[3]-d_[1])<2 and (d_[2]-d_[0])<80:
            below=[r for r in SP if abs((r[0]+r[2])/2-(d_[0]+d_[2])/2)<(d_[2]-d_[0])/2+2 and 0<=r[1]-d_[1]<=4]
            above=[r for r in SP if abs((r[0]+r[2])/2-(d_[0]+d_[2])/2)<(d_[2]-d_[0])/2+2 and 0<=d_[1]-r[3]<=4]
            for r in below+above: box=[min(box[0],r[0]),min(box[1],r[1]),max(box[2],r[2]),max(box[3],r[3])]
    bands=[(box[1],box[3])]
    pm=s[e['pg']].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=pymupdf.Rect(box[0]-1,box[1]-1.5,box[2]+1,box[3]+1.5))
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3]
    m=a.min(2)<200; ys=np.where(m.any(1))[0]
    blocks=[]
    for yy in ys:
        if blocks and yy-blocks[-1][1]<=7: blocks[-1][1]=yy
        else: blocks.append([yy,yy])
    y0p=box[1]-1.5
    cents=[((b0+b1)/2-y0p)*z for b0,b1 in bands]
    keep=[bl for bl in blocks if any(bl[0]-2<=c<=bl[1]+2 for c in cents)]
    if keep: a=a[min(k[0] for k in keep):max(k[1] for k in keep)+1]
    m=a.min(2)<200; ys=np.where(m.any(1))[0]; xs=np.where(m.any(0))[0]; a=a[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
    h,w=a.shape[:2]; H=max(35,h+10); Wd=max(458,w+12)
    can=np.full((H,Wd,3),255,np.uint8); can[(H-h)//2:(H-h)//2+h,4:4+w]=a
    Image.fromarray(can).save(f'out/a/{cur:04d}_a.png'); A[cur]=dict(t=e['t'],full=e['full'],h=h)
Q=[o['no'] for o in json.load(open('q_meta.json'))]
print('answers',len(A),'missing',[x for x in Q if x not in A][:30],'extra',[x for x in A if x not in Q][:20])
json.dump(A,open('a_meta.json','w'),ensure_ascii=False)
print([m for m in MB if m[1]>1])
