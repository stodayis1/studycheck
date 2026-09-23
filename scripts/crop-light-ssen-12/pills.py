import json, numpy as np
from scipy import ndimage
from qdet import page
out=[]
for i in range(184):
    im=page(i); R,G,B=im[...,0],im[...,1],im[...,2]
    green=(G-R>12)&(G-B>18)&(G>90)&(G<200)
    lab,_=ndimage.label(green)
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 24<=h<=48 and 40<=w<=95 and green[sl].mean()>0.55:
            out.append(dict(pg=i,x0=int(sl[1].start),y0=int(sl[0].start),
                            x1=int(sl[1].stop),y1=int(sl[0].stop),
                            half=0 if sl[1].start<500 else 1))
    if i%40==0: print('쪽',i,'누적',len(out),flush=True)
out.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
json.dump(out,open('pills.json','w'))
print('유형 머리말 후보',len(out))
