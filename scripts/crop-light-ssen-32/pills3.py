import json, numpy as np
from scipy import ndimage
from qdet import page
out=[]
for i in range(3,120):
    im=page(i); R,G,B=im[...,0],im[...,1],im[...,2]
    green=(G-R>5)&(G-B>7)&(G>70)&(G<215)   # 이 책은 스캔 채도가 낮다
    lab,_=ndimage.label(green)
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 33<=h<=46 and 54<=w<=82 and green[sl].mean()>0.15:   # 유형 알약은 38x65 로 거의 일정하다
            out.append(dict(pg=i,x0=int(sl[1].start),y0=int(sl[0].start),
                            x1=int(sl[1].stop),y1=int(sl[0].stop),
                            half=0 if sl[1].start<500 else 1))
    if i%40==0: print('쪽',i,'누적',len(out),flush=True)
out.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
json.dump(out,open('pills_body.json','w'))
print('유형 머리말',len(out))
