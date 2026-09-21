import json, numpy as np
from PIL import Image
from scipy import ndimage
from sdet import spage
from cnum import colnum_mask
GW,GH=14,20
nums=json.load(open('cnums.json',encoding='utf8'))
def norm(p):
    ys=np.where(p.any(1))[0]; xs=np.where(p.any(0))[0]
    if not len(ys) or not len(xs): return np.zeros(GW*GH)
    q=(p[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]*255).astype(np.uint8)
    v=np.asarray(Image.fromarray(q).resize((GW,GH),Image.BILINEAR),float).ravel()
    v-=v.mean(); n=np.linalg.norm(v)
    return v/(n or 1)
out=[]; cur=None; mask=None
for d in nums:
    if d['pg']!=cur: cur=d['pg']; mask=colnum_mask(spage(cur))
    sub=mask[d['y0']:d['y1'], d['x0']:d['x1']]
    lab,_=ndimage.label(sub)
    comps=[]
    for sl in ndimage.find_objects(lab):
        w=sl[1].stop-sl[1].start; h=sl[0].stop-sl[0].start
        if w>=3 and h>=8: comps.append((sl[1].start, sl[1].stop, sub[:, sl[1].start:sl[1].stop]))
    comps.sort(key=lambda c: c[0])
    # 덩어리가 4개가 아니면 넓은 덩어리를 쪼갠다
    while len(comps)<4 and comps:
        i=max(range(len(comps)), key=lambda k: comps[k][1]-comps[k][0])
        x0,x1,p=comps[i]
        if x1-x0<14: break
        col=p.sum(0); mid=len(col)//2
        lo=max(1,mid-6); hi=min(len(col)-1,mid+7)
        c=lo+int(np.argmin(col[lo:hi]))
        comps[i:i+1]=[(x0,x0+c,p[:, :c]),(x0+c,x1,p[:, c:])]
        comps.sort(key=lambda z: z[0])
    comps=comps[:4]
    gl=[norm(p) for _,_,p in comps]+[np.zeros(GW*GH)]*(4-len(comps))
    out.append(gl)
np.save('cglyphs2.npy', np.array(out))
print('글자 추출', len(out))
