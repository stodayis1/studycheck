# '대표문제' 배지 = 각 유형의 첫 문항. 유형 머리말을 놓쳐도 이것으로 유형 경계를 알 수 있다
import json, numpy as np, os
from scipy import ndimage
from qdet import page
S=os.path.dirname(os.path.abspath(__file__))
out=[]
for i in range(3,120):
    im=page(i); R,G,B=im[...,0],im[...,1],im[...,2]
    m=(R-G>30)&(R-B>55)&(R>175)
    lab,_=ndimage.label(m)
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 24<=h<=36 and 66<=w<=92 and m[sl].mean()>0.45:
            out.append(dict(pg=i,x0=int(sl[1].start),y0=int(sl[0].start),
                            x1=int(sl[1].stop),y1=int(sl[0].stop),
                            half=0 if sl[1].start<830 else 1))
    if i%30==0: print('쪽',i,'누적',len(out),flush=True)
out.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
json.dump(out,open(os.path.join(S,'reps.json'),'w'))
print('대표문제 배지',len(out))
