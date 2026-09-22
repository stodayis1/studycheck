# 해설의 '답' 아이콘을 찾는다 (회색 문서 모양, 26x26@200dpi)
import numpy as np, json
from sdet import spage
def ncc(img, tpl):
    t=tpl-tpl.mean(); t/= (np.linalg.norm(t) or 1)
    H,W=img.shape; th,tw=tpl.shape
    F=np.fft.rfft2(img, s=(H,W)); T=np.fft.rfft2(t[::-1,::-1], s=(H,W))
    corr=np.fft.irfft2(F*T, s=(H,W))[th-1:, tw-1:]
    ones=np.ones_like(t)
    O=np.fft.rfft2(ones, s=(H,W))
    s1=np.fft.irfft2(np.fft.rfft2(img, s=(H,W))*np.conj(np.fft.rfft2(ones, s=(H,W))), s=(H,W))
    s2=np.fft.irfft2(np.fft.rfft2(img**2, s=(H,W))*np.conj(O), s=(H,W))
    s1=s1[:H-th+1,:W-tw+1]; s2=s2[:H-th+1,:W-tw+1]
    n=th*tw; var=np.maximum(s2-s1**2/n, 1e-6)
    return corr/np.sqrt(var)
if __name__=='__main__':
    im=spage(4); tpl=im[1296:1322, 753:779].mean(2)
    np.save('ans_tpl.npy', tpl)
    g=im.mean(2)
    c=ncc(g,tpl)
    ys,xs=np.where(c>0.80)
    pts=[]
    for y,x in zip(ys,xs):
        if any(abs(y-p[0])<18 and abs(x-p[1])<18 for p in pts): continue
        pts.append((int(y),int(x),float(c[y,x])))
    pts.sort()
    print('쪽4 답 표시',len(pts)); print(pts)
