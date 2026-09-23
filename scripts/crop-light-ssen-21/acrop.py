import json, os, numpy as np
from PIL import Image
from adet import apage
rows=json.load(open('anums_ok.json',encoding='utf8'))
allr=json.load(open('anums.json',encoding='utf8'))
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
byp={}
for r in allr: byp.setdefault(r['pg'],[]).append(r)
cache={}; made=0
for r in rows:
    if r['pg'] not in cache: cache.clear(); cache[r['pg']]=apage(r['pg'])
    im=cache[r['pg']]; H,W=im.shape[:2]
    # 같은 줄 오른쪽의 다음 번호 전까지
    same=[o for o in byp[r['pg']] if abs(o['y0']-r['y0'])<20 and o['x0']>r['x1']+10]
    x1=min([o['x0']-10 for o in same]+[W-40])
    x0=r['x1']+8
    if x1-x0<15: continue
    a=im[max(0,r['y0']-10):min(H,r['y1']+14), x0:x1]
    g=a.mean(2); cols=np.where((g<175).any(0))[0]; rr=np.where((g<175).any(1))[0]
    if not len(cols) or not len(rr): continue
    a=a[max(0,rr[0]-4):rr[-1]+5, max(0,cols[0]-5):cols[-1]+6]
    if a.shape[1]<6: continue
    Image.fromarray(a.astype(np.uint8)).save(f"{OUT}/{r['no']:04d}.png"); made+=1
print('정답 조각',made)
