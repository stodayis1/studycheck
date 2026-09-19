import pymupdf, numpy as np, json, sys
from PIL import Image, ImageDraw
DPI=200
d=pymupdf.open('q.pdf')
def page(i):
    pm=d[i].get_pixmap(dpi=DPI); return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,3).copy()
def masks(a):
    h=np.array(Image.fromarray(a).convert('HSV')).astype(int)
    H,Sat,V=h[...,0],h[...,1],h[...,2]
    sat=(Sat>80)&(V>80)
    red=sat&((H<=24)|(H>=235))
    green=sat&(H>=60)&(H<=125)
    blue=sat&(H>=126)&(H<=185)
    dark=(a.min(2)<110)
    return red,green,blue,dark
def runs(v,gap=0,minlen=1):
    out=[];s=None;last=None
    for i,x in enumerate(v):
        if x:
            if s is None: s=i
            last=i
        elif s is not None and i-last>gap:
            if last-s+1>=minlen: out.append((s,last+1))
            s=None
    if s is not None and last-s+1>=minlen: out.append((s,last+1))
    return out
def columns(a,dark):
    Hh,W=dark.shape
    # divider: thin vertical line near center
    xs=np.arange(int(W*.40),int(W*.60))
    col=dark[int(Hh*.1):int(Hh*.9),xs].sum(0)
    div=xs[col.argmax()]
    # content horizontal extent: dark ink columns (exclude pale tab)
    ink=dark[int(Hh*.08):int(Hh*.92)].sum(0)>3
    L=np.argmax(ink); 
    # right boundary: last ink column before a big tab (tab = saturated yellow)
    R=W-1-np.argmax(ink[::-1])
    return div, L, R
if __name__=='__main__':
    for i in map(int,sys.argv[1:]):
        a=page(i); red,green,blue,dark=masks(a)
        div,L,R=columns(a,dark)
        print(i,'div',div,'L',L,'R',R, a.shape)

def divider(a):
    g=a.min(2)<215; Hh,W=g.shape
    best=None
    for x in range(int(W*.44),int(W*.56)):
        r=runs(g[:,x],gap=6)
        m=sum(e-s for s,e in r if e-s>40)
        if best is None or m>best[1]: best=(x,m)
    return best[0]

def labels(a, x0, x1, y0, y1):
    """find colored label bands at the left edge of a column"""
    red,green,blue,dark=masks(a)
    out=[]
    for cname,m in (('red',red),('green',green),('blue',blue)):
        strip=m[y0:y1, x0:x0+170]
        prof=strip.sum(1)
        for s,e in runs(prof>2,gap=3):
            ys,ye=s+y0,e+y0
            # horizontal extent of this color in band across whole column
            hx=m[ys:ye, x0:x1].sum(0)>0
            rr=runs(hx,gap=14)
            if not rr: continue
            fx0,fx1=rr[0]
            if fx0>60: continue    # must start at the left edge
            area=(ye-ys)*(fx1-fx0)
            fill=m[ys:ye, x0+fx0:x0+fx1].sum()/max(area,1)
            out.append(dict(color=cname,y0=int(ys),y1=int(ye),x0=int(x0+fx0),x1=int(x0+fx1),w=int(fx1-fx0),h=int(ye-ys),fill=round(float(fill),2)))
    out.sort(key=lambda r:r['y0'])
    return out

def classify(r):
    if r['h']<15 or r['w']<35: return None
    if r['h']>80: return 'logo'
    if r['fill']>=0.6 and r['w']>=150: return 'rep'        # 대표 문제 상자
    if r['fill']>=0.55 and 70<=r['w']<=100 and r['h']>=38: return 'pill'
    if r['w']>=100 and r['h']<=32: return 'bracket'
    if 45<=r['w']<=75 and r['h']<=32: return 'num'
    return '?'

def page_items(i):
    a=page(i); div=divider(a); Hh=a.shape[0]
    items=[]
    for side,(x0,x1) in (('L',(div-700,div-20)),('R',(div+20,div+700))):
        for r in labels(a,x0,x1,int(Hh*.04),int(Hh*.95)):
            k=classify(r)
            if k is None: continue
            r.update(kind=k,side=side,page=i,cx0=x0,cx1=x1)
            items.append(r)
    return a,div,items
