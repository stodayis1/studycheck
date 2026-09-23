import json, numpy as np, collections
from PIL import Image
from scipy import ndimage
from sdet import spage
from qscan import split_glyphs
GW,GH=14,20
def cmask(im):
    mx=im.max(2); mn=im.min(2)
    return ((mx-mn)>45)&(mx<250)&(mn<215)
def groups(m):
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
    return [g for g in res if 40<=g[-1][1]-g[0][0]<=95 and 18<=max(b[3] for b in g)-min(b[2] for b in g)<=34 and len(g)>=2]
if __name__=='__main__':
    rows=[]; gl=[]
    for i in range(88):
        im=spage(i); m=cmask(im); W=im.shape[1]
        gs=groups(m)
        if len(gs)<2:
            m=(im.mean(2)<150); gs=groups(m)
        for g in gs:
            rows.append(dict(pg=i,x0=int(g[0][0]),x1=int(g[-1][1]),y0=int(min(b[2] for b in g)),
                             y1=int(max(b[3] for b in g)),half=0 if g[0][0]<W//2 else 1))
            gl.append(split_glyphs(m,g))
        if i%20==0: print('쪽',i,'누적',len(rows),flush=True)
    order=sorted(range(len(rows)),key=lambda k:(rows[k]['pg'],rows[k]['half'],rows[k]['y0'],rows[k]['x0']))
    json.dump([rows[k] for k in order],open('snums.json','w'))
    np.save('sglyphs.npy',np.array([gl[k] for k in order]))
    print('해설 번호 후보',len(rows))
