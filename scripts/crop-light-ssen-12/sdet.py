import pymupdf, numpy as np
a=pymupdf.open('a.pdf')
DPI=200
def spage(i):
    pm=a[i].get_pixmap(dpi=DPI)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].astype(int)
