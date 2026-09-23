import numpy as np, json
from sdet import spage, snums, sec_of
from smark import ncc
tpl=np.load('ans_tpl.npy')
MID=866
nums=[]; marks=[]
import pymupdf
N=len(pymupdf.open('s.pdf'))
for p in range(1,N):
    im=spage(p); g=im.mean(2)
    for b in snums(im)[0]:
        nums.append(dict(pg=p,x0=b[0],x1=b[1],y0=b[2],y1=b[3],
                         half=0 if b[0]<MID else 1, sec=sec_of(im,b)))
    c=ncc(g,tpl); ys,xs=np.where(c>0.78); pts=[]
    for y,x in zip(ys,xs):
        if any(abs(y-q[0])<18 and abs(x-q[1])<18 for q in pts): continue
        pts.append((int(y),int(x)))
    for y,x in pts:
        marks.append(dict(pg=p,y=y,x=x,half=0 if x<MID else 1))
    if p%15==0: print('쪽',p,'번호',len(nums),'답표시',len(marks),flush=True)
nums.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
marks.sort(key=lambda d:(d['pg'],d['half'],d['y']))
json.dump(nums,open('snums.json','w')); json.dump(marks,open('smarks.json','w'))
print('번호',len(nums),'| 답 표시',len(marks))
