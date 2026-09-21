import pymupdf, numpy as np, collections
from scipy import ndimage
a=pymupdf.open('a.pdf')
DPI=300
def apage(i):
    pm=a[i].get_pixmap(dpi=DPI)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].astype(int)
def masks(im):
    R,G,B=im[...,0],im[...,1],im[...,2]
    orange=(R>120)&(R-G>35)&(G-B>10)
    green=(G-R>18)&(G-B>25)&(G<200)
    blue=(B-R>30)&(B-G>10)
    return orange,green,blue
if __name__=='__main__':
    im=apage(1)
    o,g,b=masks(im)
    for nm,m in (('주황',o),('초록',g),('파랑',b)):
        lab,n=ndimage.label(m)
        sizes=[(sl[0].stop-sl[0].start, sl[1].stop-sl[1].start) for sl in ndimage.find_objects(lab)]
        big=[s for s in sizes if s[0]>12 and s[1]>8]
        print(nm,'덩어리',n,'글자 크기 후보',len(big), collections.Counter(big).most_common(4))
