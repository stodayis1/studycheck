import pymupdf, numpy as np, collections
from scipy import ndimage
q=pymupdf.open('q.pdf')
DPI=200
def page(i):
    pm=q[i].get_pixmap(dpi=DPI)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].astype(int)
def rednum(im):
    mx=im.max(2); mn=im.min(2)
    return ((mx-mn)>45)&(mx<250)&(mn<215)        # 색 있는 글자 전부 (주황·초록·파랑)
def groups(im, dark=False):
    m=(im.mean(2)<150) if dark else rednum(im)
    lab,_=ndimage.label(m)
    bx=[]
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 14<=h<=34 and 3<=w<=80: bx.append((sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
    bx.sort(key=lambda b:(b[2],b[0])); rows=[];base=None;r=-1
    for b in bx:
        if base is None or b[2]-base>12: r+=1; base=b[2]
        rows.append((r,b))
    bx=[b for _,b in sorted(rows,key=lambda rb:(rb[0],rb[1][0]))]
    res=[];cur=[]
    for b in bx:
        if cur and -3<=b[0]-cur[-1][1]<=13 and abs(b[2]-cur[-1][2])<9: cur.append(b)
        else:
            if cur: res.append(cur)
            cur=[b]
    if cur: res.append(cur)
    cand=[]
    for g in res:
        w=g[-1][1]-g[0][0]; h=max(b[3] for b in g)-min(b[2] for b in g)
        if 40<=w<=95 and 18<=h<=34 and len(g)>=2: cand.append(g)   # 배지는 덩어리 1개 → 제외
    # 묶음 지시문 '[0025~0028]'은 같은 줄에 번호가 둘 나란히 있고 글자가 조금 작다
    out=[]
    for g in cand:
        w=g[-1][1]-g[0][0]; y=g[0][2]
        pair=any(abs(o[0][2]-y)<10 and 0<o[0][0]-g[-1][1]<130
                 and 42<=(o[-1][1]-o[0][0])<=60 and 42<=w<=60 for o in cand)
        if w>=50 and not pair: out.append(g)
    return out, m, cand
def color_of(im,g):
    x0,x1=g[0][0],g[-1][1]; y0=min(b[2] for b in g); y1=max(b[3] for b in g)
    sub=im[y0:y1,x0:x1].reshape(-1,3); sel=sub[(sub.max(1)-sub.min(1))>45]
    if not len(sel): return '?'
    r,gg,b=sel.mean(0)
    if r>gg+25 and r>b+35: return 'A'      # 주황
    if gg>r and gg>b+15: return 'B'        # 초록
    if b>r+10: return 'S'                  # 파랑(학교시험)
    return '?'
if __name__=='__main__':
    for pg in (9,10,20,60,120,150):
        im=page(pg); gs,_=groups(im)
        import collections
        print('쪽',pg,'번호',len(gs), collections.Counter(color_of(im,g) for g in gs))
