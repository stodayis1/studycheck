import json, numpy as np, collections
from scipy import ndimage
from adet import apage
def colmask(im):
    mx=im.max(2); mn=im.min(2)
    return (mx-mn>45)&(mx<250)&(mn<225)
def blobs(m):
    lab,_=ndimage.label(m)
    out=[]
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 15<=h<=42 and 4<=w<=94: out.append((sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
    return out
def rowsort(bx):
    bx=sorted(bx,key=lambda b:(b[2],b[0])); base=None; r=-1; out=[]
    for b in bx:
        if base is None or b[2]-base>14: r+=1; base=b[2]
        out.append((r,b))
    return [b for r,b in sorted(out,key=lambda rb:(rb[0],rb[1][0]))], {id(b):r for r,b in out}
def numbers(bx):
    bx,rowof=rowsort(bx)
    res=[];cur=[]
    for b in bx:
        if cur and -3<=b[0]-cur[-1][1]<=20 and abs(b[2]-cur[-1][2])<13: cur.append(b)
        else:
            if cur: res.append(cur)
            cur=[b]
    if cur: res.append(cur)
    return [g for g in res if 40<=g[-1][1]-g[0][0]<=92], rowof
def sec_of(im,g):
    x0,x1=g[0][0],g[-1][1]; y0=min(z[2] for z in g); y1=max(z[3] for z in g)
    sub=im[y0:y1,x0:x1].reshape(-1,3); sel=sub[(sub.max(1)-sub.min(1))>45]
    if not len(sel): return '?'
    r,gg,b=sel.mean(0)
    if r>gg+18 and r>b+30: return 'A'
    if gg>=r-5 and gg>b+18: return 'B'
    if b>r+5: return 'S'
    return '?'
if __name__=='__main__':
    tot=[]
    for pi in range(1,6):
        im=apage(pi); m=colmask(im)
        gs,rowof=numbers(blobs(m))
        H,W=im.shape[:2]
        for g in gs:
            tot.append(dict(pg=pi,sec=sec_of(im,g),x0=g[0][0],x1=g[-1][1],
                            y0=min(z[2] for z in g),y1=max(z[3] for z in g),
                            half=0 if g[0][0]<W//2 else 1))
    # 쪽·칸별 줄 묶어 읽기 순서
    out=[]
    for pi in range(1,6):
        for half in (0,1):
            ds=[d for d in tot if d['pg']==pi and d['half']==half]
            ds.sort(key=lambda d:(d['y0'],d['x0'])); base=None; r=-1
            for d in ds:
                if base is None or d['y0']-base>16: r+=1; base=d['y0']
                d['row']=r
            out+=sorted(ds,key=lambda d:(d['row'],d['x0']))
    print('정답 번호',len(out), collections.Counter(d['sec'] for d in out))
    json.dump(out,open('anum.json','w'))
