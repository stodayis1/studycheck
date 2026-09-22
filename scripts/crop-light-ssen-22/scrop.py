import json, os, numpy as np, collections
from PIL import Image
from sdet import spage
nums=json.load(open('snums_ok.json',encoding='utf8'))
marks=json.load(open('smarks.json',encoding='utf8'))
key=lambda d,y: (d['pg'], d['half'], y)
nums.sort(key=lambda d:key(d,d['y0']))
marks.sort(key=lambda d:key(d,d['y']))
mk=[key(m,m['y']) for m in marks]
import bisect
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
pick={}
for i,d in enumerate(nums):
    lo=key(d,d['y0'])
    hi=key(nums[i+1],nums[i+1]['y0']) if i+1<len(nums) else (10**6,0,0)
    a=bisect.bisect_left(mk,lo); b=bisect.bisect_left(mk,hi)
    if a<b: pick[d['no']]=marks[a]
print('답 표시 짝지음',len(pick),'/',len(nums))
cache={}; made=0
for no,m in sorted(pick.items()):
    if m['pg'] not in cache: cache.clear(); cache[m['pg']]=spage(m['pg'])
    im=cache[m['pg']]; H,W=im.shape[:2]
    x0=m['x']+30; x1=850 if m['half']==0 else 1615
    if x1-x0<20: continue
    a=im[max(0,m['y']-10):min(H,m['y']+38), x0:x1]
    g=a.mean(2); cols=np.where((g<180).any(0))[0]; rr=np.where((g<180).any(1))[0]
    if not len(cols) or not len(rr): continue
    a=a[max(0,rr[0]-4):rr[-1]+5, max(0,cols[0]-5):cols[-1]+6]
    if a.shape[1]<8 or a.shape[0]<10: continue
    Image.fromarray(a.astype(np.uint8)).save(f"{OUT}/{no:04d}.png"); made+=1
print('정답 조각',made)
