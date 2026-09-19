import numpy as np
from PIL import Image
GW,GH=14,22
def glyphs(mask):
    """split a 4-digit label mask into 4 normalized glyph arrays"""
    ys=np.where(mask.any(1))[0]; xs=np.where(mask.any(0))[0]
    if len(ys)==0: return None
    m=mask[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
    from scipy import ndimage
    lab,n=ndimage.label(m)
    comps=[]
    for i,sl in enumerate(ndimage.find_objects(lab)):
        if (lab[sl]==i+1).sum()<6: continue
        comps.append([sl[1].start,sl[1].stop])
    comps.sort()
    merged=[]
    for c in comps:   # merge pieces overlapping in x (broken strokes)
        if merged and c[0]<merged[-1][1]-1: merged[-1][1]=max(merged[-1][1],c[1])
        else: merged.append(c)
    if len(merged)!=4:
        W=m.shape[1]; merged=[[round(k*W/4),round((k+1)*W/4)] for k in range(4)]
    out=[]
    for x0,x1 in merged:
        g=m[:, x0:x1]
        gy=np.where(g.any(1))[0]; gx=np.where(g.any(0))[0]
        if len(gx)==0: return None
        g=g[:, gx[0]:gx[-1]+1]
        I=Image.fromarray((g*255).astype(np.uint8)).resize((GW,GH),Image.BILINEAR)
        v=np.asarray(I,float).ravel(); v-=v.mean(); n=np.linalg.norm(v); out.append(v/n if n else v)
    return out
class Reader:
    def __init__(self): self.T={}
    def learn(self,mask,label):
        gs=glyphs(mask)
        for g,ch in zip(gs,label): self.T.setdefault(ch,[]).append(g)
    def finish(self): self.M={k:np.mean(v,0) for k,v in self.T.items()}; self.M={k:v/np.linalg.norm(v) for k,v in self.M.items()}
    def read(self,mask):
        gs=glyphs(mask)
        if gs is None: return '????',0
        s='';conf=1
        for g in gs:
            sc=sorted(((float(g@v),k) for k,v in self.M.items()),reverse=True)
            s+=sc[0][1]; conf=min(conf, sc[0][0]-sc[1][0])
        return s,conf
