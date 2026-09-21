import json
from dap import find
from sdet import spage
out=[]
for i in range(104):
    im=spage(i); W=im.shape[1]
    for s,x,y in find(im, 0.72):
        out.append(dict(pg=i,x=x,y=y,score=round(float(s),3),half=0 if x<W//2 else 1))
    if i%20==0: print('쪽',i,'누적',len(out))
out.sort(key=lambda d:(d['pg'],d['half'],d['y'],d['x']))
json.dump(out,open('daps.json','w'))
print('답 표시',len(out))
