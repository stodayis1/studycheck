import json, numpy as np, collections
from PIL import Image
from det import page, boxes, groups
HALF=820
def cuts(ink):
    """번호 덩어리를 세로로 4등분 — 잉크가 가장 적은 곳에서 자른다"""
    col=ink.sum(0); w=len(col); out=[]
    for k in (1,2,3):
        c=int(w*k/4); lo=max(1,c-6); hi=min(w-1,c+7)
        out.append(lo+int(np.argmin(col[lo:hi])))
    return out
def glyphs_of(g,x0,x1,y0,y1):
    sub=(g[y0:y1,x0:x1]<130)
    cs=[0]+cuts(sub)+[sub.shape[1]]
    out=[]
    for i in range(4):
        piece=sub[:, cs[i]:cs[i+1]]
        ys=np.where(piece.any(1))[0]; xs=np.where(piece.any(0))[0]
        if not len(ys) or not len(xs): out.append(None); continue
        p=(piece[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]*255).astype(np.uint8)
        v=np.asarray(Image.fromarray(p).resize((14,20),Image.BILINEAR),float).ravel()
        v-=v.mean(); v/=(np.linalg.norm(v) or 1)
        out.append(v)
    return out
if __name__=='__main__':
    res=[]
    for i in range(176):
        g=page(i)
        for x in groups(boxes(g)):
            if not (1<=len(x)<=5): continue
            w=x[-1][1]-x[0][0]; h=max(b[3] for b in x)-min(b[2] for b in x)
            if not (60<=w<=92 and 22<=h<=36): continue
            res.append(dict(pg=i,x0=x[0][0],x1=x[-1][1],y0=min(b[2] for b in x),y1=max(b[3] for b in x),
                            half=0 if x[0][0]<HALF else 1,n=len(x)))
        if i%40==0: print('쪽',i,'누적',len(res))
    res.sort(key=lambda d:(d['pg'],d['half'],round(d['y0']/26),d['x0']))
    json.dump(res,open('cand.json','w'))
    print('후보',len(res), collections.Counter(d['n'] for d in res))
