import json, os, numpy as np
from PIL import Image
from sdet import spage
ans={int(k):v for k,v in json.load(open('ansmap.json',encoding='utf8')).items()}
nums=json.load(open('snums.json',encoding='utf8'))
marks=json.load(open('smarks.json',encoding='utf8'))
W0=1732
byp={}
for r in nums: byp.setdefault(r['pg'],[]).append(r)
mkp={}
for m in marks: mkp.setdefault(m['pg'],[]).append(m)
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
cache={}; made=0
for v,p in sorted(ans.items()):
    pg=p['pg']
    if pg not in cache: cache.clear(); cache[pg]=spage(pg)
    im=cache[pg]; H,W=im.shape[:2]
    mx,my,half=p['x'],p['y'],p['half']
    x0=mx+38
    lim=[(W-40) if half==1 else (W//2-26)]
    lim+=[r['x0']-14 for r in byp.get(pg,[]) if abs(r['y0']-my)<26 and r['x0']>mx+40]
    lim+=[o['x']-14 for o in mkp.get(pg,[]) if abs(o['y']-my)<26 and o['x']>mx+40]
    x1=min(lim)
    if x1-x0<20: continue
    a=im[max(0,my-14):min(H,my+44), x0:x1]
    g=a.mean(2); cols=np.where((g<170).any(0))[0]; rr=np.where((g<170).any(1))[0]
    if not len(cols) or not len(rr): continue
    a=a[max(0,rr[0]-5):rr[-1]+6, max(0,cols[0]-6):cols[-1]+8]
    if a.shape[1]<8: continue
    Image.fromarray(a.astype(np.uint8)).save(f"{OUT}/{v:04d}.png"); made+=1
print('정답 조각',made)
