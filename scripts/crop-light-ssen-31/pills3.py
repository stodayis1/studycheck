import json, numpy as np
from scipy import ndimage
from qdet import page
out=[]
for i in range(3,166):
    im=page(i); R,G,B=im[...,0],im[...,1],im[...,2]
    green=(G-R>12)&(G-B>18)&(G>80)&(G<205)
    lab,_=ndimage.label(green)
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 40<=h<=66 and 55<=w<=135 and green[sl].mean()>0.42:
            out.append(dict(pg=i,x0=int(sl[1].start),y0=int(sl[0].start),
                            x1=int(sl[1].stop),y1=int(sl[0].stop),
                            half=0 if sl[1].start<500 else 1))
    if i%40==0: print('쪽',i,'누적',len(out),flush=True)
out.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
json.dump(out,open('pills_body.json','w'))
print('유형 머리말',len(out))
