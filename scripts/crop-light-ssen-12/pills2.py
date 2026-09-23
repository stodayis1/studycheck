import json, numpy as np
from scipy import ndimage
from qdet import page
out=[]
for i in range(7,168):
    im=page(i); R,G,B=im[...,0],im[...,1],im[...,2]
    g=im.mean(2)
    green=(G-R>12)&(G-B>18)&(G>90)&(G<200)
    dark=g<120
    lab,_=ndimage.label(green)
    circ=[]
    lab2,_=ndimage.label(dark)
    for sl in ndimage.find_objects(lab2):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 24<=h<=46 and 24<=w<=50 and dark[sl].mean()>0.6: circ.append((sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if not (24<=h<=48 and 40<=w<=95 and green[sl].mean()>0.55): continue
        x1=sl[1].stop; y0=sl[0].start
        near=[c for c in circ if 0<=c[0]-x1<=26 and abs(c[2]-y0)<16]
        if not near: continue
        out.append(dict(pg=i,x0=int(sl[1].start),y0=int(y0),x1=int(near[0][1]),y1=int(sl[0].stop),
                        half=0 if sl[1].start<500 else 1))
    if i%40==0: print('쪽',i,'누적',len(out),flush=True)
out.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
json.dump(out,open('pills_body.json','w'))
print('유형 머리말',len(out))
