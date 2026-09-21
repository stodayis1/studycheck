import json, numpy as np
from det import page
from scipy import ndimage
out=[]
for i in range(176):
    g=page(i); dark=g<90
    lab,_=ndimage.label(dark)
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 30<=h<=50 and 50<=w<=90 and dark[sl].mean()>0.55:
            out.append(dict(pg=i,x0=int(sl[1].start),y0=int(sl[0].start),x1=int(sl[1].stop),y1=int(sl[0].stop),
                            half=0 if sl[1].start<780 else 1))
    if i%40==0: print('쪽',i,'누적',len(out))
out.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
json.dump(out,open('pills.json','w'))
print('유형 머리말 후보',len(out))
