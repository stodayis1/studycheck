import pymupdf, numpy as np
from scipy import ndimage
s=pymupdf.open('s.pdf')
DPI=200
def spage(i):
    pm=s[i].get_pixmap(dpi=DPI)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].astype(int)
def colmask(im):
    mx=im.max(2); mn=im.min(2)
    return ((mx-mn)>28)&(mx<252)&(mn<215)
def snums(im):
    m=colmask(im)
    # 글자가 번져 붙거나 끊긴다 → 가로로 이어 붙여 한 덩어리(번호)로 만든다
    j=ndimage.binary_dilation(m, np.ones((1,9),bool))
    lab,_=ndimage.label(j)
    out=[]
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if not (20<=h<=34 and 52<=w<=104): continue
        if m[sl].mean()<0.22: continue
        out.append((int(sl[1].start),int(sl[1].stop),int(sl[0].start),int(sl[0].stop)))
    out.sort(key=lambda b:(b[2],b[0]))
    return out,m
def sec_of(im,b):
    sub=im[b[2]:b[3],b[0]:b[1]].reshape(-1,3); sel=sub[(sub.max(1)-sub.min(1))>28]
    if not len(sel): return '?'
    r,g,bl=sel.mean(0)
    if g>r and g>bl+10: return 'B'
    if bl>r+12 and bl>g+6: return 'S'
    if r>g+18: return 'P' if bl>r*0.55 else 'A'
    return '?'
if __name__=='__main__':
    import collections
    for p in (1,4,29,41,66,125):
        im=spage(p); gs,_=snums(im)
        print('쪽',p,'번호',len(gs), collections.Counter(sec_of(im,b) for b in gs))
