import json, os, numpy as np
from PIL import Image
from sdet import spage
daps=json.load(open('daps.json',encoding='utf8'))
OUT='out/a2'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
cache={}; made=0
for i,d in enumerate(daps, start=1):
    if i>1237: break
    if d['pg'] not in cache: cache.clear(); cache[d['pg']]=spage(d['pg'])
    im=cache[d['pg']]; H,W=im.shape[:2]
    # 답 표시 오른쪽부터 단 오른쪽 끝까지, 그 줄만
    x0=d['x']+34; x1=(W//2-40) if d['half']==0 else (W-60)
    y0=max(0,d['y']-14); y1=min(H,d['y']+44)
    a=im[y0:y1, x0:x1]
    if a.size==0 or a.shape[1]<20: continue
    g=a.mean(2); cols=np.where((g<170).any(0))[0]; rows=np.where((g<170).any(1))[0]
    if len(cols) and len(rows): a=a[max(0,rows[0]-4):rows[-1]+5, max(0,cols[0]-6):cols[-1]+7]
    Image.fromarray(a.astype(np.uint8)).save(f"{OUT}/{i:04d}.png"); made+=1
print('정답 조각',made)
