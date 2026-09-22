import pymupdf, numpy as np
from scipy import ndimage
f=pymupdf.open('f.pdf')
DPI=200
def fpage(i):
    pm=f[i].get_pixmap(dpi=DPI)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].astype(int)
def fnums(im):
    R,G,B=im[...,0],im[...,1],im[...,2]
    mx=im.max(2); mn=im.min(2)
    m=((mx-mn)>40)&(mx<245)&(mn<200)        # 색 있는 굵은 글자
    lab,_=ndimage.label(m)
    bx=[]
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 17<=h<=24 and 3<=w<=18: bx.append((sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
    bx.sort(key=lambda b:(b[2],b[0]))
    # y 군집으로 줄 묶기
    rows=[]; base=None; r=-1
    for b in bx:
        if base is None or b[2]-base>9: r+=1; base=b[2]
        rows.append((r,b))
    bx=[b for _,b in sorted(rows,key=lambda rb:(rb[0],rb[1][0]))]
    res=[]; cur=[]
    for b in bx:
        if cur and -2<=b[0]-cur[-1][1]<=7 and abs(b[2]-cur[-1][2])<8: cur.append(b)
        else:
            if cur: res.append(cur)
            cur=[b]
    if cur: res.append(cur)
    out=[]
    for g in res:
        w=g[-1][1]-g[0][0]; h=max(b[3] for b in g)-min(b[2] for b in g)
        if 44<=w<=70 and 17<=h<=24 and len(g)>=3: out.append(g)
    return out, m
def sec_of(im,g):
    x0,x1=g[0][0],g[-1][1]; y0=min(b[2] for b in g); y1=max(b[3] for b in g)
    sub=im[y0:y1,x0:x1].reshape(-1,3); sel=sub[(sub.max(1)-sub.min(1))>40]
    if not len(sel): return '?'
    r,gg,b=sel.mean(0)
    if gg>r and gg>b+10: return 'B'      # 초록
    if b>r+15 and b>gg+10: return 'S'    # 파랑
    if r>gg+20 and r>b+25:
        return 'P' if (r<160 and b>90) else 'A'   # 보라(서술형 학교시험) vs 주황
    return '?'
if __name__=='__main__':
    import collections, json
    out=[]
    for i in range(7):
        im=fpage(i); gs,m=fnums(im)
        for g in gs:
            out.append(dict(pg=i,x0=int(g[0][0]),x1=int(g[-1][1]),
                            y0=int(min(b[2] for b in g)),y1=int(max(b[3] for b in g)),
                            sec=sec_of(im,g), half=0 if g[0][0]<840 else 1))
        print('쪽',i,'번호',len(gs),collections.Counter(sec_of(im,g) for g in gs),flush=True)
    out.sort(key=lambda d:(d['pg'],d['half'],d['y0'],d['x0']))
    json.dump(out,open('fnums.json','w'))
    print('합계',len(out))
