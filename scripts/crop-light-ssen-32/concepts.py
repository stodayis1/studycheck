import json, numpy as np
from scipy import ndimage
from qdet import page
out=[]
for i in range(0,120):
    im=page(i); R,G,B=im[...,0],im[...,1],im[...,2]
    red=(R-G>35)&(R-B>60)&(R>185)   # 이 책의 개념 머리말은 '주황색 넓은 띠'다
    lab,_=ndimage.label(red)
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 26<=h<=72 and 150<=w<=320 and red[sl].mean()>0.55:
            out.append(dict(pg=i,x0=int(sl[1].start),y0=int(sl[0].start),
                            x1=int(sl[1].stop),y1=int(sl[0].stop),
                            half=0 if sl[1].start<500 else 1))
    if i%40==0: print('쪽',i,'누적',len(out),flush=True)
out.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
json.dump(out,open('concepts.json','w'))
print('개념 머리말',len(out))
