import numpy as np
from scipy import ndimage
from sdet import spage
def colnum_mask(im):
    mx=im.max(2); mn=im.min(2)
    return ((mx-mn)>38)&(mx<235)&(mn<210)
def numbers(im):
    m=colnum_mask(im)
    lab,_=ndimage.label(m)
    bx=[]
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 16<=h<=36 and 4<=w<=80: bx.append((sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
    bx.sort(key=lambda b:(b[2],b[0])); rows=[];base=None;r=-1
    for b in bx:
        if base is None or b[2]-base>12: r+=1; base=b[2]
        rows.append((r,b))
    bx=[b for _,b in sorted(rows,key=lambda rb:(rb[0],rb[1][0]))]
    res=[];cur=[]
    for b in bx:
        if cur and -3<=b[0]-cur[-1][1]<=14 and abs(b[2]-cur[-1][2])<10: cur.append(b)
        else:
            if cur: res.append(cur)
            cur=[b]
    if cur: res.append(cur)
    out=[]
    for g in res:
        w=g[-1][1]-g[0][0]; h=max(b[3] for b in g)-min(b[2] for b in g)
        if 40<=w<=100 and 20<=h<=36: out.append(g)
    return out, m
if __name__=='__main__':
    for pg in (3,8,40,80,95):
        gs,_=numbers(spage(pg))
        print('쪽',pg,'색 번호',len(gs),[ (g[0][0],g[0][2]) for g in gs[:3]])
