import json, numpy as np, collections
from scipy import ndimage
from det import page
from scan2 import glyphs_of
LAB={2:'1',12:'0',0:'0',8:'6',9:'7',17:'9',3:'2',6:'5',33:'0',7:'0',
     15:'4',14:'3',21:'8',5:'4',42:'2',11:'9',1:'0',4:'3',58:'8',10:'8',
     16:'7',24:'1',23:'6',18:'2',22:'8',19:'0',62:'5',43:'8',37:'0',20:'7'}
cents=np.load('cents.npy'); T=collections.defaultdict(list)
for cid,ch in LAB.items(): T[ch].append(cents[cid])
M={ch:(np.mean(v,0)/(np.linalg.norm(np.mean(v,0)) or 1)) for ch,v in T.items()}
c=json.load(open('nums_ok.json',encoding='utf8'))
by={d['no']:d for d in c}
miss=[n for n in range(1,1238) if n not in by]
cache={}; added=[]
for n in miss:
    a=by.get(n-1); b=by.get(n+1)
    pgs=sorted({x['pg'] for x in (a,b) if x})
    best=None
    for p in pgs:
        if p not in cache: cache.clear(); cache[p]=page(p)
        g=cache[p]
        lab,_=ndimage.label(g<125)
        bx=[]
        for sl in ndimage.find_objects(lab):
            h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
            if 20<=h<=40 and 4<=w<=90: bx.append((sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
        bx.sort(key=lambda z:(z[2],z[0]))
        rows=[];base=None;r=-1
        for z in bx:
            if base is None or z[2]-base>12: r+=1; base=z[2]
            rows.append((r,z))
        bx=[z for _,z in sorted(rows,key=lambda rz:(rz[0],rz[1][0]))]
        grp=[];cur=[]
        for z in bx:
            if cur and -2<=z[0]-cur[-1][1]<=13 and abs(z[2]-cur[-1][2])<9: cur.append(z)
            else:
                if cur: grp.append(cur)
                cur=[z]
        if cur: grp.append(cur)
        for x in grp:
            w=x[-1][1]-x[0][0]
            if not (55<=w<=100): continue
            y0=min(z[2] for z in x); y1=max(z[3] for z in x)
            gl=glyphs_of(g,x[0][0],x[-1][1],y0,y1)
            if any(v is None for v in gl): continue
            s=''.join(max(M,key=lambda ch: float(M[ch]@v)) for v in gl)
            if s==f"{n:04d}":
                best=dict(pg=p,x0=x[0][0],x1=x[-1][1],y0=y0,y1=y1,no=n,ocr=s,
                          half=0 if x[0][0]<780 else 1,score=0.5)
                break
        if best: break
    if best: c.append(best); by[n]=best; added.append(n)
print('읽어서 채운 것',len(added),added)
print('남은',[n for n in range(1,1238) if n not in by])
json.dump(c,open('nums_ok.json','w'))
