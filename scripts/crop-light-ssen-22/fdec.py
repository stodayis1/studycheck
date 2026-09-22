import json, numpy as np, collections
from PIL import Image
from scipy import ndimage
from fdet import fpage, fnums
GW,GH=14,20
def glyphs(m,g):
    x0,x1=g[0][0],g[-1][1]; y0=min(b[2] for b in g); y1=max(b[3] for b in g)
    sub=m[y0:y1,x0:x1]; lab,_=ndimage.label(sub)
    comps=sorted([[sl[1].start,sl[1].stop] for sl in ndimage.find_objects(lab)
                  if sl[1].stop-sl[1].start>=3 and sl[0].stop-sl[0].start>=8])
    out=[]
    for a,b in comps[:4]:
        p=sub[:,a:b]; ys=np.where(p.any(1))[0]; xs=np.where(p.any(0))[0]
        if not len(ys): out.append(np.zeros(GW*GH)); continue
        q=(p[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]*255).astype(np.uint8)
        h0,w0=q.shape; nw=max(1,min(GW,int(round(w0*GH/h0))))
        c=Image.new('L',(GW,GH),0); c.paste(Image.fromarray(q).resize((nw,GH),Image.BILINEAR),((GW-nw)//2,0))
        v=np.asarray(c,float).ravel(); v-=v.mean(); v/=(np.linalg.norm(v) or 1); out.append(v)
    while len(out)<4: out.append(np.zeros(GW*GH))
    return out
rows=json.load(open('fnums.json',encoding='utf8'))
# 쪽별로 다시 모아 글자 벡터 만들기
byp=collections.defaultdict(list)
for i,r in enumerate(rows): byp[r['pg']].append(i)
G=[None]*len(rows)
for pg,idxs in sorted(byp.items()):
    im=fpage(pg); gs,m=fnums(im)
    pos={(int(g[0][0]),int(min(b[2] for b in g))):g for g in gs}
    for i in idxs:
        g=pos.get((rows[i]['x0'],rows[i]['y0']))
        G[i]=glyphs(m,g) if g is not None else [np.zeros(GW*GH)]*4
G=np.array(G)
# 앞 10개(0001~0010)로 본보기 만들기
T={}
for k in range(10):
    s=f"{k+1:04d}"
    for j,ch in enumerate(s): T.setdefault(int(ch),[]).append(G[k][j])
TK=sorted(T); TM=np.array([np.mean(T[k],0) for k in TK])
TM/= np.linalg.norm(TM,axis=1,keepdims=True)
dec=[]; conf=[]
for v in G:
    s=0; c=1.0
    for j in range(4):
        sim=TM@v[j]; b=int(np.argmax(sim)); s=s*10+TK[b]; c=min(c,float(sim[b]))
    dec.append(s); conf.append(c)
ok=sum(1 for i,d in enumerate(dec) if d==i+1)
print('순서대로 맞는 개수',ok,'/',len(dec))
bad=[(i+1,dec[i],round(conf[i],2)) for i in range(len(dec)) if dec[i]!=i+1]
print('어긋난 곳',len(bad),bad[:20])
json.dump(dict(dec=dec,conf=conf),open('fdec.json','w'))
