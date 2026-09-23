import numpy as np
from scipy import ndimage
from sdet import spage
TPL=None
def template():
    global TPL
    if TPL is None:
        g=spage(1).mean(2)
        t=g[336:368, 962:996].astype(float)      # '답' 아이콘
        t=t-t.mean(); t/=(np.linalg.norm(t) or 1); TPL=t
    return TPL
def conv(a,k):
    H,W=a.shape; kh,kw=k.shape
    fh,fw=H+kh-1, W+kw-1
    F=np.fft.rfft2(a,s=(fh,fw))*np.fft.rfft2(k[::-1,::-1],s=(fh,fw))
    full=np.fft.irfft2(F,s=(fh,fw))
    return full[kh-1:kh-1+H-kh+1, kw-1:kw-1+W-kw+1]
def find(im, thr=0.72):
    g=im.mean(2).astype(float); t=template(); th,tw=t.shape
    ones=np.ones_like(t)
    num=conv(g,t); s1=conv(g,ones); s2=conv(g*g,ones)
    n=th*tw; var=np.maximum(s2-s1*s1/n,1e-6)
    ncc=num/np.sqrt(var)
    lab,_=ndimage.label(ncc>thr); pts=[]
    for sl in ndimage.find_objects(lab):
        sub=ncc[sl]; iy,ix=np.unravel_index(np.argmax(sub),sub.shape)
        y=sl[0].start+iy; x=sl[1].start+ix
        pts.append((float(ncc[y,x]),int(x),int(y)))
    return pts
if __name__=='__main__':
    for pg in (1,2,40,77):
        print('쪽',pg,'답 표시',len(find(spage(pg))))
