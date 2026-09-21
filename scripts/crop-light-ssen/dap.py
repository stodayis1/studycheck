import numpy as np
from scipy import ndimage
from sdet import spage
TPL=None
def template():
    global TPL
    if TPL is None:
        g=spage(3).mean(2)
        t=g[512:542, 757:787].astype(float)
        t=t-t.mean(); t/= (np.linalg.norm(t) or 1)
        TPL=t
    return TPL
def find(im, thr=0.45):
    g=im.mean(2).astype(float)
    t=template(); th,tw=t.shape
    def conv(a, k):
        H,W=a.shape; kh,kw=k.shape
        fh,fw=H+kh-1, W+kw-1
        F=np.fft.rfft2(a, s=(fh,fw))*np.fft.rfft2(k[::-1,::-1], s=(fh,fw))
        full=np.fft.irfft2(F, s=(fh,fw))
        return full[kh-1:kh-1+H-kh+1, kw-1:kw-1+W-kw+1]
    ones=np.ones_like(t)
    num=conv(g, t); s1=conv(g, ones); s2=conv(g*g, ones)
    n=th*tw
    var=np.maximum(s2 - s1*s1/n, 1e-6)
    ncc=num/np.sqrt(var)
    pts=[]
    mask=ncc>thr
    lab,k=ndimage.label(mask)
    for sl in ndimage.find_objects(lab):
        sub=ncc[sl]
        iy,ix=np.unravel_index(np.argmax(sub), sub.shape)
        y=sl[0].start+iy; x=sl[1].start+ix
        pts.append((float(ncc[y,x]), int(x), int(y)))
    return sorted(pts, key=lambda p:(p[2],p[1]))
if __name__=='__main__':
    for pg in (3,8,40,80):
        pts=find(spage(pg))
        print('쪽',pg,'답 표시',len(pts), [(round(s,2),x,y) for s,x,y in pts[:4]])
