import json
from sdet import spage
from sdap import find
out=[]
for pg in range(88):
    for s,x,y in find(spage(pg), 0.72):
        out.append(dict(pg=pg,x=x,y=y,score=round(float(s),3)))
    if pg%20==0: print('쪽',pg,'누적',len(out),flush=True)
json.dump(out,open('smarks.json','w'))
print('답 표시',len(out))
